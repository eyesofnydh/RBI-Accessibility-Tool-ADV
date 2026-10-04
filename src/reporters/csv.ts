import { writeFileSync } from 'node:fs';
import path from 'node:path';
import type { RunResult } from '../types';
import { toCsv } from '../utils/misc';

const tri = (s: boolean | null) => (s === null ? 'null' : String(s));

/**
 * CSV files for the bug sheet:
 *   accessibility-report.csv   every failure and manual-review item (section 49 columns)
 *   issue-groups.csv           each distinct issue once, with the pages it appears on
 *   contrast-report.csv        every element checked for contrast, passes included (section 4)
 *   color-inventory.csv        every colour found (section 43)
 *   links.csv                  every link, marked internal or external
 *   keyboard-focus-order.csv   the Tab path of each page (section 31)
 */
export function writeCsv(run: RunResult, outDir: string): string {
  const issues = run.pages.flatMap((p) => p.findings);
  const file = path.join(outDir, 'accessibility-report.csv');
  writeFileSync(file, toCsv(
    ['Issue ID', 'Group ID', 'Page', 'URL', 'Section', 'Issue', 'Bug sentence', 'Steps to Reproduce', 'Actual Result', 'Expected Result', 'WCAG Criterion', 'WCAG Name', 'WCAG Level', 'Severity', 'Category', 'Confidence', 'Viewport / zoom', 'Selector', 'XPath', 'Element', 'Role', 'Accessible name', 'Evidence', 'Screenshot', 'Status', 'Result', 'Elements affected', 'RBI regression', 'Manual check', 'Recommendation', 'Source'],
    issues.map((f) => [f.id, f.group || '', f.page, f.url, f.section, f.issue, f.bugSentence, f.steps.map((s, i) => `${i + 1}. ${s}`).join(' '), f.actual, f.expected, f.wcag, f.wcagName, f.level, f.severity, f.category, f.confidence, f.context, f.selector, f.xpath, f.element, f.role, f.name, [f.evidence, f.why].filter(Boolean).join(' '), f.screenshot, tri(f.status), f.result, f.count, f.regression, f.manualInstruction, f.recommendation, f.source]),
    4,
  ));
  writeFileSync(path.join(outDir, 'issue-groups.csv'), toCsv(
    ['Group ID', 'Issue', 'Bug sentence', 'Status', 'Severity', 'WCAG Criterion', 'WCAG Level', 'Category', 'Pages affected', 'Occurrences', 'Viewport / state', 'Selector', 'First issue ID', 'Screenshot', 'Pages'],
    run.issueGroups.map((g) => [g.id, g.issue, g.bugSentence, tri(g.status), g.severity, g.wcag, g.level, g.category, g.pages, g.occurrences, g.context, g.selector, g.firstId, g.screenshot, g.urls.join(' | ')]),
    1,
  ));
  writeFileSync(path.join(outDir, 'contrast-report.csv'), toCsv(
    ['Page', 'Element', 'Check', 'Text', 'Foreground', 'Background', 'Foreground RGB', 'Background RGB', 'Foreground CSS', 'Background CSS', 'Font size', 'Font weight', 'Large text', 'Ratio', 'Required', 'WCAG', 'Pass', 'Note', 'WebAIM check'],
    run.pages.flatMap((p) => p.contrast.map((c) => [p.url, c.selector, c.check, c.text, c.foreground, c.background, c.foregroundRgb, c.backgroundRgb, c.foregroundCss, c.backgroundCss, c.fontSize, c.fontWeight, c.largeText === null ? '' : String(c.largeText), c.contrastRatio === null ? '' : c.contrastRatio.toFixed(2), c.requiredRatio, c.wcag, tri(c.status), c.note, c.webaim])),
    1,
  ));
  writeFileSync(path.join(outDir, 'color-inventory.csv'), toCsv(
    ['Color', 'As written', 'CSS variable', 'Source stylesheet', 'Selector', 'Property', 'Used by (rendered elements)', 'Used as', 'Occurrences in CSS'],
    run.colors.map((c) => [c.color, c.raw.join(' | '), c.variables.join(' | '), [...new Set(c.sources.map((s) => s.stylesheet))].join(' | '), c.sources.map((s) => s.selector).join(' | '), [...new Set(c.sources.map((s) => s.property))].join(' | '), c.usedBy, c.usedAs.join(' | '), c.occurrences]),
    1,
  ));
  writeFileSync(path.join(outDir, 'links.csv'), toCsv(
    ['Page', 'Visible text', 'Accessible name', 'href', 'Internal or external', 'Says external or new tab', 'target', 'rel', 'aria-current'],
    run.pages.flatMap((p) => (p.links as Record<string, unknown>[]).map((l) => [p.url, l.text, l.name, l.href, l.type, String(l.saysExternalOrNewTab), l.target, l.rel, l.ariaCurrent])),
    1,
  ));
  writeFileSync(path.join(outDir, 'keyboard-focus-order.csv'), toCsv(
    ['Page', 'Step', 'Element', 'Selector', 'Accessible name', 'Role', 'X', 'Y', 'Width', 'Height', 'In viewport', 'Visible', 'Covered by', 'Focus indicator'],
    run.pages.flatMap((p) => p.focusOrder.map((s) => [p.url, s.step, s.tag, s.selector, s.name, s.role, s.boundingBox?.x ?? '', s.boundingBox?.y ?? '', s.boundingBox?.width ?? '', s.boundingBox?.height ?? '', String(s.inViewport), String(s.visible), s.obscuredBy, s.indicator.join(' + ') || 'none found in CSS'])),
    2,
  ));
  return file;
}
