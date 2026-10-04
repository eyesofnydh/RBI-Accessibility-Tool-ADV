import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RunResult } from '../types';
import { escapeHtml } from '../utils/misc';

/**
 * reports/index.html: a self-contained dashboard (data, CSS and JS are all inside the one file),
 * so it opens by double-click as well as through "npm run report".
 */
export function writeHtml(run: RunResult, outDir: string): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const css = readFileSync(path.join(here, 'dashboard.css'), 'utf8');
  const js = readFileSync(path.join(here, 'dashboard.js'), 'utf8');

  // Contrast: failures and manual-review rows in full; passes grouped by colour pair to keep the file small.
  const contrast = run.pages.flatMap((p) => p.contrast.filter((c) => c.status !== true).map((c) => ({ ...c, url: p.url })));
  const groups = new Map<string, { foreground: string; background: string; requiredRatio: number; contrastRatio: number | null; check: string; wcag: string; webaim: string; count: number; pages: number; sample: string; seen: Set<string> }>();
  for (const p of run.pages) for (const c of p.contrast) {
    if (c.status !== true) continue;
    const key = [c.foreground, c.background, c.requiredRatio, c.check].join('|');
    let g = groups.get(key);
    if (!g) { g = { foreground: c.foreground, background: c.background, requiredRatio: c.requiredRatio, contrastRatio: c.contrastRatio, check: c.check, wcag: c.wcag, webaim: c.webaim, count: 0, pages: 0, sample: c.text, seen: new Set() }; groups.set(key, g); }
    g.count++;
    if (!g.seen.has(p.url)) { g.seen.add(p.url); g.pages++; }
  }
  const data = {
    meta: { tool: run.tool, version: run.version, standard: run.standard, startedAt: run.startedAt, finishedAt: run.finishedAt, browser: run.browser, baseUrl: run.baseUrl },
    totals: run.totals,
    pages: run.pages.map((p) => ({ url: p.url, title: p.title, summary: p.summary, headingTree: p.headingTree, landmarkTree: p.landmarkTree, tables: p.tables, focusOrder: p.focusOrder, links: p.links, images: p.images, liveRegions: p.liveRegions, screenshots: p.screenshots, errors: p.errors, ariaSnapshotFile: p.ariaSnapshotFile, lighthouseScore: p.lighthouseScore, durationMs: p.durationMs })),
    findings: run.pages.flatMap((p) => p.findings),
    groups: run.issueGroups,
    contrast,
    contrastPasses: [...groups.values()].map(({ seen, ...g }) => g).sort((a, b) => (a.contrastRatio || 0) - (b.contrastRatio || 0)),
    colors: run.colors,
    checklist: run.manualChecklist,
  };
  const json = JSON.stringify(data).replace(/</g, '\\u003c').replace(/\u2028|\u2029/g, '');
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Accessibility report - ${escapeHtml(run.baseUrl)}</title>
<style>${css}</style>
</head>
<body>
<header class="top">
  <h1>Accessibility report</h1>
  <p>${escapeHtml(run.baseUrl)} &nbsp;|&nbsp; ${escapeHtml(run.standard)} &nbsp;|&nbsp; ${run.totals.pages} page(s) &nbsp;|&nbsp; ${escapeHtml(new Date(run.finishedAt).toLocaleString('en-IN'))}</p>
  <nav class="tabs" id="tabs" role="tablist" aria-label="Report sections"></nav>
</header>
<main id="view" tabindex="-1"></main>
<script id="report-data" type="application/json">${json}</script>
<script>${js}</script>
</body>
</html>`;
  const file = path.join(outDir, 'index.html');
  writeFileSync(file, html);
  return file;
}
