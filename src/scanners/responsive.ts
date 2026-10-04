import type { Page } from 'playwright';
import type { PageCtx, Scanner } from '../context';
import { openPage } from '../context';
import { focusVisiblePass } from './keyboard';

export interface LayoutPass { prefix: 'responsive' | 'zoom' | 'reflow'; label: string; shotPrefix: string; sub: string; checks: boolean }

/**
 * Scrolls the whole page taking a screenshot of every screenful, then runs the layout checks
 * (overflow, truncation, overlap, off-screen controls, disappearing content, fixed covers, small targets)
 * and a short Tab pass to confirm focus stays visible. Shared by the responsive and zoom scanners.
 */
export async function layoutPass(ctx: PageCtx, page: Page, o: LayoutPass): Promise<void> {
  ctx.data.screenshots[`${o.label} full page`] = await ctx.shotFull(o.shotPrefix, 'full-page', o.sub, page);
  const { height, viewport } = await page.evaluate(() => ({ height: document.documentElement.scrollHeight, viewport: window.innerHeight }));
  const screens = Math.min(ctx.config.limits.maxScrollScreens, Math.max(1, Math.ceil(height / viewport)));
  for (let i = 0; i < screens; i++) {
    await page.evaluate((y) => window.scrollTo(0, y), i * viewport);
    await page.waitForTimeout(120);
    ctx.data.screenshots[`${o.label} screen ${i + 1} of ${Math.ceil(height / viewport)}`] = await ctx.shotScreen(o.shotPrefix, 'screen-' + String(i + 1).padStart(2, '0'), o.sub, page);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  if (!o.checks) return;
  ctx.budget(Math.max(4, ctx.config.limits.maxScreenshotsPerPage / 12));
  const res = await ctx.scan('layout', { prefix: o.prefix, label: o.label, baseline: ctx.baseline, checkTargets: o.prefix !== 'zoom', fixedCoverRatio: ctx.config.layout.fixedCoverRatio }, o.label, page);
  // The Tab pass comes first: highlighting elements for screenshots can move the point Tab starts from.
  if (ctx.config.tests.keyboard) await focusVisiblePass(ctx, page, o.label);
  await ctx.shootFindings(res.findings, () => o.shotPrefix, o.sub, page);
}

/** Small-viewport test (section 5). Sizes come from config.viewports; the default is 360x256 and 320x256. */
export const responsive: Scanner = {
  test: 'responsive', name: 'Responsive',
  async run(ctx) {
    for (const vp of ctx.config.viewports) {
      const label = `${vp.width}x${vp.height}`;
      await ctx.page.setViewportSize(vp);
      await openPage(ctx.run, ctx.page, ctx.url);
      await layoutPass(ctx, ctx.page, { prefix: 'responsive', label, shotPrefix: 'responsive-' + label, sub: '', checks: true });
    }
    await ctx.page.setViewportSize(ctx.config.desktopViewport);
  },
};
