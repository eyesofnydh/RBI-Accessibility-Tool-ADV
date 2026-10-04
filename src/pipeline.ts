/**
 * Turns raw scanner output into final findings:
 * attaches the rule and WCAG data, removes duplicates, caps noisy rules and writes the bug sentence.
 */
import type { A11yConfig } from './config';
import type { Category, Finding, PageSummary, RawFinding, RuleMeta } from './types';
import { criterion } from './wcag/criteria';
import { ruleFor } from './wcag/rules';

/** axe rule -> custom rules that check the same thing. When both hit the same element only one issue is kept. */
export const AXE_EQUIV: Record<string, string[]> = {
  'image-alt': ['images.'], 'input-image-alt': ['images.', 'names.missing'], 'role-img-alt': ['images.'], 'svg-img-alt': ['images.svg-name'],
  'link-name': ['links.missing-name'], 'button-name': ['names.missing'], 'input-button-name': ['names.missing'], 'aria-command-name': ['names.missing', 'links.missing-name'],
  'aria-toggle-field-name': ['names.missing'], 'label': ['forms.label'], 'select-name': ['forms.label'], 'aria-input-field-name': ['forms.label'],
  'aria-hidden-focus': ['aria.hidden-focusable'], 'nested-interactive': ['aria.nested-interactive'], 'html-has-lang': ['lang.missing'],
  'html-lang-valid': ['lang.invalid'], 'document-title': ['page.title-missing'], 'duplicate-id-aria': ['ids.duplicate-referenced'],
  'heading-order': ['headings.skipped'], 'empty-heading': ['headings.empty'], 'page-has-heading-one': ['headings.no-h1'],
  'landmark-one-main': ['landmarks.main'], 'landmark-no-duplicate-main': ['landmarks.main'], 'landmark-unique': ['landmarks.unnamed'],
  'aria-dialog-name': ['modal.name'], 'label-content-name-mismatch': ['names.label-in-name'], 'td-headers-attr': ['tables.headers-ref'],
  'aria-valid-attr-value': ['aria.broken-ref'], 'tabindex': ['keyboard.tabindex-positive'], 'link-in-text-block': ['contrast.link-in-text'],
  'empty-table-header': ['tables.'], 'bypass': ['landmarks.bypass'], 'aria-allowed-role': ['aria.redundant-role'],
};
const PAGE_LEVEL_AXE = new Set(['html-has-lang', 'html-lang-valid', 'document-title', 'page-has-heading-one', 'landmark-one-main', 'bypass']);

let issueSeq = 0;
export function resetIssueIds(): void { issueSeq = 0; }

export class Collector {
  raws: RawFinding[] = [];
  passes: Record<string, number> = {};
  /** Metadata for axe rules, which are not in the rule registry. */
  axeMeta: Record<string, RuleMeta> = {};

  add(list: RawFinding[], context = 'desktop', source: RawFinding['source'] = 'custom'): RawFinding[] {
    for (const r of list) { r.context = r.context || context; r.source = r.source || source; this.raws.push(r); }
    return list;
  }
  pass(rule: string, n = 1): void { if (n > 0) this.passes[rule] = (this.passes[rule] || 0) + n; }
  addPasses(p: Record<string, number>): void { for (const [k, v] of Object.entries(p)) this.pass(k, v); }

  meta(rule: string, raw?: RawFinding): RuleMeta {
    const m = ruleFor(rule) || this.axeMeta[rule];
    const base: RuleMeta = m || { id: rule, title: rule, wcag: '', category: 'ARIA', severity: 'Moderate', expected: '', fix: '', why: '' };
    return raw?.meta ? { ...base, ...raw.meta } : base;
  }

  /** Removes axe findings that repeat a custom finding on the same element. */
  private dedupe(): RawFinding[] {
    const custom = this.raws.filter((r) => r.source !== 'axe');
    const out: RawFinding[] = [...custom];
    const seen = new Set<string>();
    for (const r of this.raws.filter((x) => x.source === 'axe')) {
      const axeId = r.rule.replace(/^axe\./, '');
      const equiv = AXE_EQUIV[axeId] || [];
      const twin = custom.find((c) => equiv.some((p) => c.rule.startsWith(p)) && (PAGE_LEVEL_AXE.has(axeId) || (!!c.el && !!r.el && (c.el.ref === r.el.ref || c.el.selector === r.el.selector || c.el.selector.startsWith(r.el.selector + ' ') || r.el.selector.startsWith(c.el.selector + ' ')))));
      if (twin) { twin.evidence = [twin.evidence, `Also reported by axe-core rule "${axeId}".`].filter(Boolean).join(' '); if (twin.status === false) twin.confidence = twin.confidence || 'confirmed'; continue; }
      const key = r.rule + '|' + (r.el?.ref || r.actual) + '|' + r.context;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(r);
    }
    // The same rule on the same element in the same context is one issue.
    const uniq = new Map<string, RawFinding>();
    for (const r of out) {
      const key = r.rule + '|' + (r.el?.ref || r.actual) + '|' + r.context;
      if (!uniq.has(key)) uniq.set(key, r);
    }
    return [...uniq.values()];
  }

  private sr = 'your screen reader';

  finalize(url: string, title: string, config: A11yConfig): { findings: Finding[]; summary: PageSummary } {
    this.sr = config.manual.screenReader;
    const byRule = new Map<string, RawFinding[]>();
    for (const r of this.dedupe()) byRule.set(r.rule, (byRule.get(r.rule) || []).concat(r));
    const findings: Finding[] = [];
    const cap = config.limits.maxFindingsPerRule;
    for (const [rule, list] of byRule) {
      list.sort((a, b) => Number(a.status === null) - Number(b.status === null));
      const kept = list.slice(0, cap);
      if (list.length > cap) {
        const rest = list.slice(cap);
        kept.push({ rule, status: rest.every((r) => r.status === null) ? null : false, actual: `${rest.length} more element(s) have the same issue. The first ${cap} are listed individually; raise limits.maxFindingsPerRule to list them all.`, count: rest.reduce((n, r) => n + (r.count || 1), 0), context: rest[0].context, source: rest[0].source, meta: rest[0].meta });
      }
      for (const r of kept) findings.push(this.toFinding(r, url, title));
    }
    const order = { Critical: 0, Serious: 1, Moderate: 2, Minor: 3 } as const;
    findings.sort((a, b) => Number(a.status === null) - Number(b.status === null) || order[a.severity] - order[b.severity]);
    for (const f of findings) f.id = 'A11Y-' + String(++issueSeq).padStart(4, '0');

    const normative = (f: Finding) => f.level === 'A' || f.level === 'AA';
    const failed = findings.filter((f) => f.status === false && normative(f)).reduce((n, f) => n + f.count, 0);
    const projectFailed = findings.filter((f) => f.status === false && !normative(f)).reduce((n, f) => n + f.count, 0);
    const manualReview = findings.filter((f) => f.status === null).length; // one item to check, however many elements it lists
    const passed = Object.values(this.passes).reduce((a, b) => a + b, 0);
    const blocking = failed + (config.rbi.projectRulesAffectVerdict ? projectFailed : 0);
    return { findings, summary: { url, title, passed, failed, manualReview, projectFailed, wcagAA: blocking > 0 ? false : manualReview > 0 ? null : true } };
  }

  private toFinding(r: RawFinding, url: string, title: string): Finding {
    const named = (t: string | undefined) => (t || '').replace(/\{sr\}/g, this.sr);
    const m0 = this.meta(r.rule, r);
    const m = { ...m0, manual: m0.manual ? named(m0.manual) : undefined, why: named(m0.why), expected: named(m0.expected) };
    const sc = criterion(m.wcag);
    const el = r.el;
    const vars: Record<string, string | number> = { name: el?.name || el?.text || '', role: el?.role || 'element', selector: el?.selector || 'page', actual: r.actual, ...(r.vars || {}) };
    const fill = (t: string) => t.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
    const bug = r.status === false && m.bug ? fill(m.bug) : `${m.title.replace(/\.$/, '')}: ${r.actual}`;
    const context = r.context || 'desktop';
    const steps = [`Open ${url}.`];
    if (context.startsWith('opened: ')) steps.push(`Open ${context.slice(8)}.`);
    else if (context === 'forced colours') steps.push('Turn on Windows High Contrast (or emulate "forced-colors: active" in DevTools, Rendering tab).');
    else if (context === 'text spacing') steps.push('Apply the WCAG text spacing values (line height 1.5, paragraph spacing 2em, letter spacing 0.12em, word spacing 0.16em), for example with the Text Spacing bookmarklet.');
    else if (context !== 'desktop') steps.push(/zoom/.test(context) ? `Set the browser to ${context}.` : `Resize the browser viewport to ${context}.`);
    if (el?.section) steps.push(`Go to the "${el.section}" section.`);
    if (['Keyboard', 'Focus', 'Modals'].includes(m.category)) steps.push(el ? `Press Tab until focus reaches "${el.name || el.text || el.selector}".` : 'Navigate the page with the Tab key.');
    else if (el) steps.push(`Inspect "${(el.name || el.text || el.tag).slice(0, 60)}" (${el.selector}).`);
    if (r.status === null && m.manual) steps.push(m.manual);
    return {
      id: '', rule: r.rule, status: r.status, result: r.status === false ? 'FAIL' : 'MANUAL_REVIEW',
      confidence: r.confidence || m.confidence || (r.status === null ? 'manual' : 'confirmed'),
      wcag: m.wcag, wcagName: sc.name, level: m.level || sc.level, category: m.category, severity: r.severity || m.severity,
      issue: m.title, bugSentence: bug.replace(/\s+/g, ' ').trim(), url, page: title, section: el?.section || '', context,
      selector: el?.selector || '', xpath: el?.xpath || '', element: el?.tag || '', role: el?.role || '', name: el?.name || '', text: el?.text || '',
      html: el?.html || '', computedStyle: el?.computedStyle || {}, boundingBox: el?.boundingBox || null,
      actual: r.actual, expected: m.expected, evidence: r.evidence || '', why: m.why, screenshot: r.screenshot || '',
      recommendation: m.fix, steps, manualInstruction: r.status === null ? m.manual || 'Verify this manually.' : '',
      regression: m.regression || '', source: r.source || 'custom', count: r.count || 1,
    };
  }
}

/** Category of a rule, for the per-category totals. */
export function categoryOf(rule: string, collector?: Collector): Category {
  return (ruleFor(rule) || collector?.axeMeta[rule])?.category || 'ARIA';
}
