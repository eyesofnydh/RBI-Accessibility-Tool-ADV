import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import * as playwright from 'playwright';
import type { A11yConfig } from './config';
import type { RunCtx } from './context';
import { Frontier, normalizeUrl } from './crawler/crawler';
import { buildChecklist } from './checklist';
import { Collector, categoryOf, resetIssueIds } from './pipeline';
import { testPage } from './runner';
import type { ColorEntry, IssueGroup, PageResult, RuleMeta, RunResult } from './types';
import { lighthouseScore } from './utils/lighthouse';
import { RULES } from './wcag/rules';

export interface RunHooks {
  /** Return true to stop before the next page (the page being tested is finished first). */
  shouldStop?: () => boolean;
  /** Called after each page. */
  onPage?: (done: number, url: string) => void;
}

/** Runs the whole audit: one page plus config.urls ("test"), or a same-origin crawl ("crawl"). */
export async function runAudit(config: A11yConfig, mode: 'test' | 'crawl', log: (m: string) => void = console.log, hooks: RunHooks = {}): Promise<RunResult> {
  if (!config.baseUrl && config.urls.length) config.baseUrl = config.urls[0];
  if (!config.baseUrl) throw new Error('No URL given. Use --url=https://example.com, set TARGET_URL, or set baseUrl in accessibility.config.ts.');
  const startedAt = new Date();
  const outDir = path.resolve(config.output.dir);
  rmSync(path.join(outDir, 'screenshots'), { recursive: true, force: true });
  rmSync(path.join(outDir, 'accessibility-tree'), { recursive: true, force: true });
  mkdirSync(path.join(outDir, 'screenshots'), { recursive: true });
  resetIssueIds();

  const browser = await playwright[config.browser].launch({ headless: config.headless });
  const run: RunCtx = { config, browser, outDir, shotSeq: { n: 0 }, colors: new Map<string, ColorEntry>(), log };
  const pages: PageResult[] = [];
  const extraRules: Record<string, RuleMeta> = {};
  const same = (u: string) => normalizeUrl(u, config.baseUrl!, config.crawl);
  const extra = [...new Set(config.urls.map((u) => new URL(u, config.baseUrl).href))].filter((u) => same(u) !== same(config.baseUrl!));
  const frontier = new Frontier(config.baseUrl, config.crawl, extra);
  const limit = mode === 'crawl' ? config.crawl.maxPages : 1 + extra.length;

  try {
    for (let item = frontier.next(); item && pages.length < limit; item = frontier.next()) {
      if (hooks.shouldStop?.()) { log(`Stopped on request after ${pages.length} page(s).`); break; }
      log(mode === 'crawl' ? `[page ${pages.length + 1}, ${frontier.pending} queued, limit ${limit}] ${item.url}` : `[${pages.length + 1}/${limit}] ${item.url}`);
      const { result, links, axeMeta } = await testPage(run, item.url);
      Object.assign(extraRules, axeMeta);
      if (config.lighthouse.enabled) result.lighthouseScore = await lighthouseScore(item.url, config);
      pages.push(result);
      const s = result.summary;
      log(`    passed ${s.passed}, failed ${s.failed}, manual review ${s.manualReview}, RBI project rules ${s.projectFailed}  (${Math.round(result.durationMs / 1000)}s)`);
      hooks.onPage?.(pages.length, item.url);
      if (mode === 'crawl') frontier.add(links, item.depth);
    }
  } finally {
    await browser.close();
  }

  // The same title on different pages (section 22). Needs every page, so it is checked here.
  const byTitle = new Map<string, PageResult[]>();
  pages.forEach((p) => { if (p.title) byTitle.set(p.title, (byTitle.get(p.title) || []).concat(p)); });
  byTitle.forEach((group, title) => {
    if (group.length < 2) return;
    for (const p of group) {
      const c = new Collector();
      c.add([{ rule: 'page.title-review', status: null, actual: `The title "${title}" is also used by ${group.length - 1} other page(s): ${group.filter((g) => g !== p).slice(0, 3).map((g) => g.url).join(', ')}.` }]);
      const f = c.finalize(p.url, p.title, config).findings[0];
      f.id = f.id + 'T';
      p.findings.push(f);
      p.summary.manualReview++;
      if (p.summary.wcagAA === true) p.summary.wcagAA = null;
    }
  });

  // Group the same issue across pages: a header problem that appears on 40 pages is one distinct issue.
  const groups = new Map<string, IssueGroup>();
  for (const p of pages) for (const f of p.findings) {
    const where = f.selector || f.actual.replace(/\d+/g, '#');
    const key = [f.rule, f.status, f.context.replace(/".*"/, ''), where].join('|');
    let g = groups.get(key);
    if (!g) {
      g = { id: 'G-' + String(groups.size + 1).padStart(4, '0'), rule: f.rule, issue: f.issue, bugSentence: f.bugSentence, status: f.status, severity: f.severity, wcag: f.wcag, level: f.level, category: f.category, selector: f.selector, context: f.context, pages: 0, occurrences: 0, urls: [], firstId: f.id, screenshot: f.screenshot };
      groups.set(key, g);
    }
    f.group = g.id;
    g.occurrences += f.count;
    if (!g.screenshot && f.screenshot) g.screenshot = f.screenshot;
    if (!g.urls.includes(f.url)) { g.urls.push(f.url); g.pages++; }
  }
  const sevOrder = ['Critical', 'Serious', 'Moderate', 'Minor'];
  const issueGroups = [...groups.values()].sort((a, b) => Number(a.status === null) - Number(b.status === null) || sevOrder.indexOf(a.severity) - sevOrder.indexOf(b.severity) || b.pages - a.pages);

  // Totals.
  const allRules = { ...RULES, ...extraRules };
  const totals: RunResult['totals'] = { pages: pages.length, passed: 0, failed: 0, manualReview: 0, projectFailed: 0, score: 0, wcagAA: true, bySeverity: {}, byLevel: {}, byCategory: {} };
  const cat = (name: string) => (totals.byCategory[name] = totals.byCategory[name] || { passed: 0, failed: 0, manualReview: 0, project: 0 });
  for (const p of pages) {
    totals.passed += p.summary.passed; totals.failed += p.summary.failed; totals.manualReview += p.summary.manualReview; totals.projectFailed += p.summary.projectFailed;
    for (const [rule, n] of Object.entries(p.passes)) cat((allRules[rule] || { category: categoryOf(rule) }).category).passed += n;
    for (const f of p.findings) {
      if (f.status === null) { cat(f.category).manualReview++; continue; }
      if (f.level === 'A' || f.level === 'AA') cat(f.category).failed += f.count; else cat(f.category).project += f.count;
      totals.bySeverity[f.severity] = (totals.bySeverity[f.severity] || 0) + f.count;
      totals.byLevel[f.level] = (totals.byLevel[f.level] || 0) + f.count;
    }
  }
  const blocking = totals.failed + (config.rbi.projectRulesAffectVerdict ? totals.projectFailed : 0);
  const broken = pages.some((p) => p.summary.error);
  totals.wcagAA = blocking > 0 ? false : totals.manualReview > 0 || broken ? null : true;
  totals.score = totals.passed + totals.failed ? Math.round((totals.passed / (totals.passed + totals.failed)) * 1000) / 10 : 0;

  return {
    tool: 'rbi-accessibility-tester', version: '2.0.0', standard: 'WCAG 2.2 Level AA',
    startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString(), browser: config.browser, baseUrl: config.baseUrl,
    pages, totals,
    issueGroups,
    colors: [...run.colors.values()].sort((a, b) => b.usedBy - a.usedBy || b.occurrences - a.occurrences),
    manualChecklist: buildChecklist(pages, config),
    rules: allRules,
  };
}

export { normalizeUrl };
