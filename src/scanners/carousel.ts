import type { Scanner } from '../context';
import type { ElementEvidence } from '../types';

/**
 * Carousels (section 30): name, focusable off-screen slides, and auto-rotation without a pause control.
 * Rotation is detected by watching the carousel's DOM for a few seconds without touching the page.
 */
export const carousel: Scanner = {
  test: 'carousel', name: 'Carousels',
  async run(ctx) {
    const { data } = await ctx.scan<{ ref: string; name: string; hasPause: boolean }[]>('carousels');
    ctx.data.features.carousels = data.length;
    if (!data.length) return;
    await ctx.dom('carouselWatchStart');
    await ctx.page.waitForTimeout(ctx.config.carousel.observeMs);
    const moved = await ctx.dom<{ ref: string; changes: number }[]>('carouselWatchStop');
    for (const c of data) {
      const m = moved.find((x) => x.ref === c.ref);
      if (!m) continue;
      if (c.hasPause) { ctx.collector.pass('carousel.autoplay'); continue; }
      ctx.collector.add([{
        rule: 'carousel.autoplay', status: false, el: (await ctx.dom<ElementEvidence | null>('evidenceOf', c.ref)) || undefined,
        actual: `The carousel changed by itself (${m.changes} DOM change(s) in ${Math.round(ctx.config.carousel.observeMs / 1000)}s with no interaction) and has no pause, stop or play button.`,
        vars: { name: c.name || 'carousel' },
      }], 'desktop', 'interaction');
    }
    ctx.collector.add([{ rule: 'sr.announcement', status: null, actual: `Carousels: ${data.length} found. Slide changes, the current slide and the previous/next buttons must be announced. Programmatic accessibility markup was checked; speech was not.`, vars: { feature: 'Carousel announcement' } }], 'desktop');
  },
};
