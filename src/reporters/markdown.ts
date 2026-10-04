import { writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Finding, RunResult } from '../types';

const cell = (s: unknown) => String(s ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
const verdictText = (v: boolean | null) => (v === false ? 'FAIL (false)' : v === null ? 'No automatic failures; manual review pending (null)' : 'PASS (true)');

/** reports/accessibility-report.md: a readable summary that can be pasted into a ticket or wiki. */
export function writeMarkdown(run: RunResult, outDir: string): string {
  const t = run.totals;
  const all = run.pages.flatMap((p) => p.findings);
  const fails = all.filter((f) => f.status === false && (f.level === 'A' || f.level === 'AA'));
  const project = all.filter((f) => f.status === false && f.level !== 'A' && f.level !== 'AA');
  const manual = all.filter((f) => f.status === null);
  const out: string[] = [];
  out.push(`# Accessibility report: ${run.baseUrl}`, '');
  out.push(`Standard: ${run.standard}. Run: ${run.startedAt} to ${run.finishedAt}. Browser: ${run.browser}. Pages tested: ${t.pages}.`, '');
  out.push(`**Overall WCAG AA: ${verdictText(t.wcagAA)}**`, '');
  out.push('Result values: `true` = pass, `false` = fail, `null` = needs manual review. A manual-review item is never counted as a pass.', '');
  out.push('| Passed checks | Failed checks | Manual reviews | RBI project-rule failures | Score |', '|---|---|---|---|---|');
  out.push(`| ${t.passed} | ${t.failed} | ${t.manualReview} | ${t.projectFailed} | ${t.score}% |`, '');
  out.push(`Distinct issues: ${run.issueGroups.length}. The same issue on several pages is counted once here; issue-groups.csv lists them.`, '');
  out.push('Score = passed / (passed + failed) over automatic WCAG checks only. It is a progress indicator, not a conformance claim.', '');

  out.push('## By category', '', '| Category | Passed | Failed (WCAG) | Manual review | RBI project rules |', '|---|---|---|---|---|');
  Object.entries(t.byCategory).sort().forEach(([c, v]) => out.push(`| ${c} | ${v.passed} | ${v.failed} | ${v.manualReview} | ${v.project} |`));
  out.push('', '## By page', '', '| Page | Passed | Failed | Manual review | WCAG AA |', '|---|---|---|---|---|');
  run.pages.forEach((p) => out.push(`| ${cell(p.url)} | ${p.summary.passed} | ${p.summary.failed} | ${p.summary.manualReview} | ${p.summary.wcagAA === null ? 'null' : p.summary.wcagAA} |`));

  const table = (title: string, list: Finding[], note: string) => {
    out.push('', `## ${title} (${list.length})`, '', note, '');
    if (!list.length) { out.push('None.'); return; }
    out.push('| ID | Severity | WCAG | Page | Bug sentence | Selector | Screenshot |', '|---|---|---|---|---|---|---|');
    list.forEach((f) => out.push(`| ${f.id} | ${f.severity} | ${f.wcag || f.level} | ${cell(f.url)} | ${cell(f.bugSentence)} | \`${cell(f.selector)}\` | ${f.screenshot ? `[image](${f.screenshot})` : ''} |`));
  };
  table('WCAG failures', fails, 'Confirmed or probable failures of a WCAG 2.2 Level A or AA criterion.');
  table('RBI project-rule failures', project, 'Expectations from RBI audits and good practice that WCAG itself does not strictly require. They do not change the WCAG verdict.');

  out.push('', `## Manual review required (${manual.length})`, '', 'The tool could not decide these. Each line says what to check.', '');
  if (manual.length) {
    out.push('| ID | WCAG | Page | What was found | What to check |', '|---|---|---|---|---|');
    manual.forEach((f) => out.push(`| ${f.id} | ${f.wcag || f.level} | ${cell(f.url)} | ${cell(f.bugSentence)} | ${cell(f.manualInstruction)} |`));
  } else out.push('None.');

  out.push('', '## Color Contrast Report', '', 'Failures and manual-review rows only. Every checked element, passes included, is in contrast-report.csv.', '');
  const rows = run.pages.flatMap((p) => p.contrast.filter((c) => c.status !== true).map((c) => ({ p, c })));
  if (rows.length) {
    out.push('| Page | Element | Text | Foreground | Background | Ratio | Required | WCAG | Pass |', '|---|---|---|---|---|---|---|---|---|');
    rows.forEach(({ p, c }) => out.push(`| ${cell(p.url)} | \`${cell(c.selector)}\` | ${cell(c.text)} | ${c.foreground} | ${c.background} | ${c.contrastRatio === null ? 'n/a' : c.contrastRatio.toFixed(2)} | ${c.requiredRatio} | ${c.wcag} | ${c.status === null ? 'null' : c.status} |`));
  } else out.push('No contrast failures.');

  out.push('', '## Manual Screen Reader Verification Required', '', 'Automated tools cannot hear a screen reader. Where markup is correct the report says "Programmatic accessibility markup: PASS" and leaves the announcement as MANUAL_REVIEW.', '');
  run.manualChecklist.forEach((i) => out.push(`- [ ] **${i.area}: ${i.item}.** ${i.how}${i.pages.length ? ` Pages: ${i.pages.slice(0, 8).join(', ')}${i.pages.length > 8 ? `, and ${i.pages.length - 8} more` : ''}.` : ''}`));

  for (const p of run.pages) {
    out.push('', `## Page structure: ${p.url}`, '', '### Heading tree', '', '```text', p.headingTree || '(no headings)', '```', '', '### Landmark tree', '', '```text', p.landmarkTree || '(no landmarks)', '```');
    if (p.errors.length) out.push('', '### Notes from this page', '', ...p.errors.map((e) => '- ' + e));
  }
  const file = path.join(outDir, 'accessibility-report.md');
  writeFileSync(file, out.join('\n') + '\n');
  return file;
}
