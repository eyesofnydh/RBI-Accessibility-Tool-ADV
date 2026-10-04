import type { Scanner } from '../context';

/** Landmark tree, main landmark, labelled repeats, skip link (section 32). DOM logic: src/browser/structure.ts */
export const landmarks: Scanner = {
  test: 'landmarks', name: 'Landmarks',
  async run(ctx) {
    const { data } = await ctx.scan<{ tree: string }>('landmarks');
    ctx.data.landmarkTree = data.tree;
  },
};
