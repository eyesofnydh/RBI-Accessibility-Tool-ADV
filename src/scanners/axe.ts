import { AxeBuilder } from '@axe-core/playwright';
import type { Scanner } from '../context';
import type { ElementEvidence, RawFinding, RuleMeta, Severity } from '../types';
import { AXE_EQUIV } from '../pipeline';
import { AXE_DISABLED } from '../wcag/rules';

const IMPACT: Record<string, Severity> = { critical: 'Critical', serious: 'Serious', moderate: 'Moderate', minor: 'Minor' };

function category(id: string, tags: string[]): RuleMeta['category'] {
  if (/heading/.test(id)) return 'Headings';
  if (/^(list|listitem|dlitem|definition-list)$/.test(id)) return 'Lists';
  if (/landmark|region|bypass|skip-link/.test(id)) return 'Landmarks';
  if (/^(td-|th-|table|scope)/.test(id)) return 'Tables';
  if (/target-size/.test(id)) return 'Responsive';
  if (/^link-|-link/.test(id)) return 'Links';
  if (tags.includes('cat.color')) return 'Color Contrast';
  if (tags.includes('cat.keyboard')) return 'Keyboard';
  if (tags.includes('cat.forms')) return 'Forms';
  if (tags.includes('cat.text-alternatives')) return 'Images';
  if (tags.includes('cat.tables')) return 'Tables';
  if (tags.includes('cat.language') || tags.includes('cat.time-and-media')) return 'Page';
  return 'ARIA';
}
/** "wcag143" -> "1.4.3" */
function criterionOf(tags: string[]): string {
  for (const t of tags) { const m = /^wcag(\d)(\d)(\d{1,2})$/.exec(t); if (m) return `${m[1]}.${m[2]}.${m[3]}`; }
  return '';
}

/**
 * axe-core run (section 45). Results are merged with the custom scanners:
 * where a custom rule covers the same element, the axe finding is dropped by the pipeline.
 */
export const axe: Scanner = {
  test: 'axe', name: 'axe-core',
  async run(ctx) {
    const results = await new AxeBuilder({ page: ctx.page })
      .withTags(ctx.config.axe.tags)
      .disableRules([...AXE_DISABLED, ...ctx.config.axe.disableRules])
      .analyze();

    const register = (r: { id: string; help: string; description: string; tags: string[]; impact?: string | null; helpUrl: string }): string => {
      const id = 'axe.' + r.id;
      const wcag = criterionOf(r.tags);
      ctx.collector.axeMeta[id] = {
        id, title: r.help.replace(/\.?$/, '.'), wcag, category: category(r.id, r.tags), severity: IMPACT[r.impact || 'moderate'] || 'Moderate',
        expected: r.description, fix: 'See ' + r.helpUrl, why: `axe-core rule "${r.id}": ${r.description}`,
        level: wcag ? undefined : 'Best practice',
        manual: 'axe-core could not decide this automatically. Inspect the element and apply the rule described at ' + r.helpUrl,
      };
      return id;
    };
    // Table markup and list markup are optional tests: when they are off, axe's table and list rules are left out too.
    const wanted = (r: { id: string; tags: string[] }): boolean => {
      const c = category(r.id, r.tags);
      return !((c === 'Tables' && !ctx.config.tests.tables) || (c === 'Lists' && !ctx.config.tests.lists));
    };
    const toFindings = async (list: typeof results.violations, status: false | null, perRule: number): Promise<RawFinding[]> => {
      const out: RawFinding[] = [];
      for (const v of list) {
        if (!wanted(v)) continue;
        const rule = register(v);
        for (const node of v.nodes.slice(0, perRule)) {
          const target = node.target.length === 1 && typeof node.target[0] === 'string' ? node.target[0] : '';
          const el = target ? await ctx.dom<ElementEvidence | null>('axeEvidence', target) : null;
          const summary = (node.failureSummary || '').replace(/\s+/g, ' ').replace(/^Fix (any|all) of the following: /, '').trim();
          out.push({ rule, status, el: el || undefined, actual: summary || v.help, evidence: target && !el ? 'Element: ' + target : '', source: 'axe', severity: IMPACT[node.impact || v.impact || 'moderate'] });
        }
        if (v.nodes.length > perRule) out.push({ rule, status, actual: `${v.nodes.length - perRule} more element(s) reported by axe-core for this rule.`, count: v.nodes.length - perRule, source: 'axe' });
      }
      return out;
    };
    ctx.collector.add(await toFindings(results.violations, false, ctx.config.limits.maxFindingsPerRule), 'desktop', 'axe');
    // "Incomplete" means axe needs a human. Rules a custom scanner already covers are left to that scanner.
    ctx.collector.add(await toFindings(results.incomplete.filter((r) => !AXE_EQUIV[r.id]), null, 5), 'desktop', 'axe');
    for (const p of results.passes) {
      if (AXE_EQUIV[p.id] || !wanted(p)) continue; // the custom rule counts these passes
      ctx.collector.pass(register(p), p.nodes.length);
    }
  },
};
