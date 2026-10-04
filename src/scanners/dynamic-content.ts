import type { PageCtx, Scanner } from '../context';
import { openPage } from '../context';
import type { ElementEvidence, RawFinding } from '../types';

/**
 * Live regions and status messages (sections 24, 25).
 * The search test types a query and records DOM changes, live-region updates and where focus ends up.
 * It checks the markup only. What the screen reader says is always left as MANUAL_REVIEW (section 47).
 */
/**
 * Pagination: presses "next" and waits up to 6 seconds for the results to change (they may come from the server).
 * A full page load announces itself. A change without a page load must move focus or update a live region.
 */
async function pagination(ctx: PageCtx): Promise<void> {
  const { page } = ctx;
  const p = await ctx.dom<{ navRef: string; nextRef: string; current: string; labelled: boolean; hasCurrent: boolean } | null>('paginationTarget');
  if (!p) return;
  ctx.data.features.pagination = 1;
  const add = (list: RawFinding[]) => ctx.collector.add(list, 'desktop', 'interaction');
  const el = (await ctx.dom<ElementEvidence | null>('evidenceOf', p.navRef)) || undefined;
  if (!p.hasCurrent) add([{ rule: 'pagination.current', status: false, el, actual: 'No item in the pagination has aria-current.' }]);
  else ctx.collector.pass('pagination.current');
  try {
    await page.evaluate(() => { (window as unknown as { __a11yPagerMark?: number }).__a11yPagerMark = 1; });
    await ctx.dom('mutationWatchStart');
    await page.locator(`[data-a11y-ref="${p.nextRef}"]`).click({ timeout: 3000 });
    let res: { total: number; live: number; liveText: string; active: string; activeIsInput: boolean } | null = null;
    let sameDocument = true;
    for (let i = 0; i < 12; i++) {
      await page.waitForTimeout(500);
      sameDocument = await page.evaluate(() => (window as unknown as { __a11yPagerMark?: number }).__a11yPagerMark === 1).catch(() => false);
      if (!sameDocument) break;
      if ((await ctx.dom<number>('mutationWatchPeek').catch(() => 0)) > 0) { await page.waitForTimeout(500); break; } // let the update finish
    }
    if (sameDocument) res = await ctx.dom('mutationWatchStop');
    if (!sameDocument) { ctx.collector.pass('dynamic.pagination-not-announced'); }
    else if (!res || res.total === 0) ctx.data.errors.push('Pagination test: pressing "next" did not change the content within 6 seconds.');
    else {
      const stayed = res.active === (await ctx.dom<ElementEvidence | null>('evidenceOf', p.nextRef))?.selector || /pagination|pager/i.test(res.active);
      const facts = `Pressing "next": ${res.total} DOM change(s), ${res.live} inside a live region${res.liveText ? ` ("${res.liveText}")` : ''}; focus ended on ${res.active}.`;
      if (res.live > 0 || !stayed) {
        ctx.collector.pass('dynamic.pagination-not-announced');
        add([{ rule: 'sr.announcement', status: null, el, actual: `Pagination: ${res.live > 0 ? 'a live region was updated' : 'focus moved to the new results'}. Programmatic accessibility markup: PASS. ${facts}`, vars: { feature: 'Pagination announcement' } }]);
      } else add([{ rule: 'dynamic.pagination-not-announced', status: false, el, actual: facts }]);
    }
  } catch (e) {
    ctx.data.errors.push('Pagination test could not run: ' + (e as Error).message.split('\n')[0]);
  }
  await openPage(ctx.run, page, ctx.url);
}

export const dynamicContent: Scanner = {
  test: 'dynamicContent', name: 'Dynamic content',
  async run(ctx) {
    const { page, config } = ctx;
    const { data } = await ctx.scan<unknown[]>('live');
    ctx.data.liveRegions = data;
    ctx.data.features.liveRegions = data.length;
    await pagination(ctx);
    if (!config.search.enabled) return;

    const ref = config.search.input
      ? (await ctx.dom<ElementEvidence | null>('axeEvidence', config.search.input))?.ref || ''
      : await ctx.dom<string>('findSearch');
    if (!ref) return;
    ctx.data.features.search = 1;
    const add = (list: RawFinding[]) => ctx.collector.add(list, 'desktop', 'interaction');
    const field = page.locator(`[data-a11y-ref="${ref}"]`);
    const el = (await ctx.dom<ElementEvidence | null>('evidenceOf', ref)) || undefined;
    const startUrl = page.url();
    try {
      await page.evaluate(() => { (window as unknown as { __a11ySearchMark?: number }).__a11ySearchMark = 1; });
      await ctx.dom('mutationWatchStart');
      await field.fill(config.search.query, { timeout: 3000 });
      if (config.search.submit) await page.locator(config.search.submit).first().click({ timeout: 3000 });
      else await field.press('Enter');
      await page.waitForTimeout(2500);
      await page.waitForLoadState('load', { timeout: 8000 }).catch(() => undefined);

      const sameDocument = await page.evaluate(() => (window as unknown as { __a11ySearchMark?: number }).__a11ySearchMark === 1).catch(() => false);
      if (!sameDocument) {
        // A full page load: the new page's title announces the change, so this is not a dynamic update.
        ctx.collector.pass('dynamic.search-not-announced');
        ctx.data.errors.push(`Search test: searching for "${config.search.query}" loaded a new page (${page.url()}). Result announcement is covered by that page's title.`);
      } else {
        const res = await ctx.dom<{ total: number; live: number; liveText: string; active: string; activeIsInput: boolean }>('mutationWatchStop');
        const facts = `Search for "${config.search.query}": ${res.total} DOM change(s), ${res.live} inside a live region${res.liveText ? ` ("${res.liveText}")` : ''}; focus ended on ${res.active}.`;
        if (res.total === 0) ctx.data.errors.push(`Search test: typing "${config.search.query}" and pressing Enter changed nothing on the page. Set search.submit in the config if a button must be clicked.`);
        else if (res.live > 0 || !res.activeIsInput) {
          ctx.collector.pass('dynamic.search-not-announced');
          add([{ rule: 'sr.announcement', status: null, el, actual: `Search results: ${res.live > 0 ? 'a live region was updated' : 'focus moved to the results'}. Programmatic accessibility markup: PASS. ${facts}`, vars: { feature: 'Search result announcement' } }]);
        } else {
          add([{ rule: 'dynamic.search-not-announced', status: false, el, actual: facts, vars: { query: config.search.query }, screenshot: await ctx.shotElement(ref, 'WCAG-4.1.3', 'search') }]);
        }
      }
    } catch (e) {
      ctx.data.errors.push('Search test could not run: ' + (e as Error).message.split('\n')[0]);
    }
    // Put the page back the way it was for the scanners that follow.
    if (page.url() !== startUrl || !(await page.evaluate(() => (window as unknown as { __a11ySearchMark?: number }).__a11ySearchMark === 1).catch(() => false))) await openPage(ctx.run, page, ctx.url);
    else { await field.fill('').catch(() => undefined); await openPage(ctx.run, page, ctx.url); }
  },
};
