import type { Scanner } from '../context';
import { newContext, openPage } from '../context';
import { layoutPass } from './responsive';

/**
 * Browser zoom (section 6).
 * Playwright cannot press Ctrl +, so zoom is reproduced the way the browser does it: at 200% the page gets
 * half the CSS width and height of the desktop viewport, drawn at twice the pixel density.
 * 100% is captured for comparison. 400% uses 320x256, the WCAG 1.4.10 reflow condition.
 * Screenshots go to 100-percent/, 200-percent/ and 400-percent/.
 */
export const zoom: Scanner = {
  test: 'zoom', name: 'Zoom',
  async run(ctx) {
    const { config } = ctx;
    const levels = [...new Set(config.zoomLevels)].sort();
    if (config.optionalReflow400 && !levels.includes(4)) levels.push(4);
    for (const z of levels) {
      const pct = Math.round(z * 100);
      const viewport = z === 4 ? { width: 320, height: 256 } : { width: Math.round(config.desktopViewport.width / z), height: Math.round(config.desktopViewport.height / z) };
      const label = z === 4 ? 'zoom 400% (320x256)' : `zoom ${pct}%`;
      // 400% is the same condition as a 320px-wide viewport. If that was already tested, only take the screenshots.
      const alreadyChecked = z === 4 && config.tests.responsive && config.viewports.some((v) => v.width === 320);
      const context = await newContext(ctx.run, viewport, z);
      try {
        const page = await context.newPage();
        await openPage(ctx.run, page, ctx.url);
        await layoutPass(ctx, page, { prefix: z === 4 ? 'reflow' : 'zoom', label, shotPrefix: 'zoom-' + pct, sub: pct + '-percent', checks: z !== 1 && !alreadyChecked });
      } catch (e) {
        ctx.data.errors.push(`Zoom ${pct}%: ${(e as Error).message.split('\n')[0]}`);
      } finally {
        await context.close();
      }
    }
  },
};
