import type { Scanner } from '../context';

/** Heading tree and heading markup checks (requirement section 10). DOM logic: src/browser/structure.ts */
export const headings: Scanner = {
  test: 'headings', name: 'Headings',
  async run(ctx) {
    const { data } = await ctx.scan<{ tree: string; count: number }>('headings');
    ctx.data.headingTree = data.tree;
    ctx.data.features.headings = data.count;
  },
};
