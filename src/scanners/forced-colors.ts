import type { Scanner } from '../context';
import { newContext, openPage } from '../context';
import { FocusJudge } from './focus';
import { traverse } from './keyboard';

/**
 * Windows High Contrast (forced colours). The page is loaded with "forced-colors: active" emulated.
 * A full-page screenshot is saved for a visual check, and a Tab pass confirms the focus indicator survives:
 * box-shadow and background colours are removed in this mode, so indicators built only from them vanish.
 * Forced colours are not part of WCAG itself, so findings here are reported as best practice.
 */
export const forcedColors: Scanner = {
  test: 'forcedColors', name: 'Forced colours (Windows High Contrast)',
  async run(ctx) {
    const context = await newContext(ctx.run, ctx.config.desktopViewport, 1, { forcedColors: 'active' });
    try {
      const page = await context.newPage();
      await openPage(ctx.run, page, ctx.url);
      ctx.data.screenshots['forced colours full page'] = await ctx.shotFull('forced-colors', 'full-page', 'forced-colors', page);
      if (ctx.config.tests.keyboard && ctx.config.tests.focus) {
        ctx.budget(Math.max(4, ctx.config.limits.maxScreenshotsPerPage / 12));
        await traverse(ctx, page, 'forced colours', 40, new FocusJudge(ctx, page, 'forced colours', 'forced'), { report: false });
      }
    } catch (e) {
      ctx.data.errors.push('Forced colours: ' + (e as Error).message.split('\n')[0]);
    } finally {
      await context.close();
    }
  },
};
