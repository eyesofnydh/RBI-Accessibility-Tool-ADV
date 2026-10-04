import type { Scanner } from '../context';

/** Alt text, decorative, functional and complex images, SVG and canvas (section 13). DOM logic: src/browser/semantics.ts */
export const images: Scanner = {
  test: 'images', name: 'Images',
  async run(ctx) {
    const { data, findings } = await ctx.scan<{ classification: string }[]>('images');
    ctx.data.images = data;
    ctx.data.features.images = data.length;
    ctx.data.features.media = (await ctx.scan<number>('media')).data;
    ctx.data.features.complexImages = findings.filter((f) => f.rule === 'images.complex').length + data.filter((i) => i.classification === 'Complex').length;
  },
};
