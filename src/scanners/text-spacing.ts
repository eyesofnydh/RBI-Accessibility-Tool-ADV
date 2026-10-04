import type { Scanner } from '../context';
import { openPage } from '../context';

/** The four values WCAG 1.4.12 names. */
const SPACING_CSS = `
  * { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; }
  p { margin-bottom: 2em !important; }
`;

/**
 * Text spacing (WCAG 1.4.12). Applies the WCAG spacing values, the same ones the Text Spacing bookmarklet uses,
 * then looks for text that is now cut off or overlapping and was not before.
 */
export const textSpacing: Scanner = {
  test: 'textSpacing', name: 'Text spacing',
  async run(ctx) {
    const { page } = ctx;
    await page.setViewportSize(ctx.config.desktopViewport);
    await openPage(ctx.run, page, ctx.url);
    await page.addStyleTag({ content: SPACING_CSS });
    await page.waitForTimeout(400);
    ctx.data.screenshots['text spacing full page'] = await ctx.shotFull('text-spacing', 'full-page', 'text-spacing');
    ctx.budget(Math.max(4, ctx.config.limits.maxScreenshotsPerPage / 12));
    const res = await ctx.scan('layout', { prefix: 'spacing', label: 'increased text spacing', baseline: ctx.baseline, checkTargets: false, fixedCoverRatio: 1, only: ['truncated', 'overlap'] }, 'text spacing');
    await ctx.shootFindings(res.findings, () => 'WCAG-1.4.12', 'text-spacing');
  },
};
