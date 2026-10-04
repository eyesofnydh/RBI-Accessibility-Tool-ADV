import type { RunResult } from '../types';

const n = (v: number) => v.toLocaleString('en-US').padStart(7);

/** The summary printed at the end of a run (section 53). */
export function consoleSummary(run: RunResult, reportPath: string): string {
  const t = run.totals;
  const failed = (...cats: string[]) => cats.reduce((sum, c) => sum + (t.byCategory[c]?.failed || 0), 0);
  const named = ['Color Contrast', 'Keyboard', 'Focus', 'ARIA', 'Responsive', 'Zoom', 'Images'];
  const other = Object.entries(t.byCategory).filter(([c]) => !named.includes(c)).reduce((s, [, v]) => s + v.failed, 0);
  const verdict = t.wcagAA === false ? '\u274C FAIL' : t.wcagAA === null ? '\u26A0 NO AUTOMATIC FAILURES - MANUAL REVIEW PENDING (not a pass)' : '\u2705 PASS';
  const line = '===========================================';
  return [
    line, 'RBI ACCESSIBILITY TEST RESULTS', line, '',
    `Pages Tested: ${t.pages}`, '',
    'WCAG AA',
    `Passed Checks:      ${n(t.passed)}`,
    `Failed Checks:      ${n(t.failed)}`,
    `Manual Reviews:     ${n(t.manualReview)}`,
    `RBI project rules:  ${n(t.projectFailed)}   (reported separately, not WCAG failures)`,
    `Distinct issues:    ${n(run.issueGroups.length)}   (the same issue on several pages counted once)`, '',
    `Color Contrast Failures: ${failed('Color Contrast')}`,
    `Keyboard Failures:       ${failed('Keyboard')}`,
    `Focus Failures:          ${failed('Focus')}`,
    `ARIA Failures:           ${failed('ARIA')}`,
    `Responsive Failures:     ${failed('Responsive', 'Zoom')}`,
    `Image/Alt Failures:      ${failed('Images')}`,
    `Other:                   ${other}`, '',
    'Overall WCAG AA:', verdict, '',
    'Report:', reportPath, line,
  ].join('\n');
}
