import type { Scanner } from '../context';
import { openPage } from '../context';
import type { OpenTarget } from '../browser/states';
import type { ContrastRow, RawFinding } from '../types';

/**
 * Content that is hidden when the page loads: menus, accordions, dropdowns, <details> and unselected tabs.
 * Each one is opened, the newly shown content is tested (contrast, names, links, images, forms), and it is closed again.
 * Controls that appear inside opened content are opened too, down to limits.maxOpenDepth levels.
 * Only issues that were not already found on the closed page are added, labelled with what was opened.
 */
export const openedContent: Scanner = {
  test: 'openedContent', name: 'Menus, accordions and tabs',
  async run(ctx) {
    const { page, config } = ctx;
    await openPage(ctx.run, page, ctx.url);
    const known = new Set(ctx.collector.raws.filter((r) => r.el).map((r) => r.rule + '|' + r.el!.selector));
    const knownRows = new Set(ctx.data.contrast.map((r) => r.check + '|' + r.selector));
    const scans: [string, unknown][] = [];
    if (config.tests.contrast) scans.push(['contrast', { borders: config.contrast.borders }]);
    if (config.tests.aria) scans.push(['names', undefined]);
    if (config.tests.links) scans.push(['links', config.site.internalHosts]);
    if (config.tests.images) scans.push(['images', undefined]);
    if (config.tests.forms) scans.push(['forms', undefined]);
    if (!scans.length) return;

    const done = new Set<string>();
    let opened = 0, found = 0;
    const visit = async (targets: OpenTarget[], depth: number, trail: string): Promise<boolean> => {
      for (const t of targets) {
        if (opened >= config.limits.maxOpenStates) return true;
        if (done.has(t.selector)) continue;
        done.add(t.selector);
        const control = page.locator(`[data-a11y-ref="${t.ref}"]`);
        if (!(await control.count())) continue;
        const startUrl = page.url();
        await control.click({ timeout: 2500 }).catch(() => undefined);
        await page.waitForTimeout(450);
        if (page.url() !== startUrl) { await openPage(ctx.run, page, ctx.url); return false; }
        if (!(await ctx.dom<boolean>('isOpen', t.ref).catch(() => false))) continue;
        opened++;

        const label = `opened: ${trail}${t.kind === 'tab' ? 'the tab' : 'the control'} "${t.name}"`;
        const fresh: RawFinding[] = [];
        for (const [name, arg] of scans) {
          const res = await page.evaluate(([n, a]) => (window as unknown as { __a11y: { run: (n: string, a: unknown) => unknown } }).__a11y.run(n as string, a) as never, [name, arg]) as { findings: RawFinding[]; data: unknown };
          for (const f of res.findings) {
            if (!f.el) continue;
            const key = f.rule + '|' + f.el.selector;
            if (known.has(key)) continue;
            known.add(key);
            fresh.push(f);
          }
          if (name === 'contrast') {
            let passed = 0;
            for (const row of res.data as ContrastRow[]) {
              const key = row.check + '|' + row.selector;
              if (knownRows.has(key)) continue;
              knownRows.add(key);
              ctx.data.contrast.push({ ...row, url: ctx.url, note: [`Inside "${t.name}" (opened)`, row.note].filter(Boolean).join('; ') });
              if (row.status === true) passed++;
            }
            ctx.collector.pass('contrast.text', passed);
          }
        }
        found += fresh.length;
        ctx.collector.add(fresh, label, 'interaction');
        await ctx.shootFindings(fresh, (r) => 'WCAG-' + (ctx.collector.meta(r.rule).wcag || 'RBI'));

        if (depth < config.limits.maxOpenDepth) {
          const inner = (await ctx.dom<OpenTarget[]>('openTargets', 6)).filter((x) => !done.has(x.selector));
          if (!(await visit(inner, depth + 1, `${trail}"${t.name}", then `))) return false;
        }
        if (t.kind === 'tab') continue; // tabs stay where they are; the next one replaces it
        await control.click({ timeout: 2000 }).catch(() => undefined);
        await page.waitForTimeout(250);
        if (await ctx.dom<boolean>('isOpen', t.ref).catch(() => false)) { await page.keyboard.press('Escape'); await page.waitForTimeout(250); }
        if (await ctx.dom<boolean>('isOpen', t.ref).catch(() => false)) { await openPage(ctx.run, page, ctx.url); return false; }
      }
      return true;
    };

    let total = 0;
    for (let round = 0; round < 6 && opened < config.limits.maxOpenStates; round++) {
      const top = (await ctx.dom<OpenTarget[]>('openTargets', 6)).filter((t) => !done.has(t.selector));
      if (round === 0) total = top.length;
      if (!top.length) break;
      if (await visit(top, 1, '')) break; // false means the page was reloaded: look again for what is left
    }
    ctx.data.features.openable = total;
    ctx.data.features.opened = opened;
    if (total || opened) ctx.data.errors.push(`Opened content: ${opened} menu(s), accordion(s) or tab(s) were opened and tested (${total} found at the top level; limit ${config.limits.maxOpenStates} per page). ${found} new issue(s) were found inside them.`);
  },
};
