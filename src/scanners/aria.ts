import type { Scanner } from '../context';

/** Accessible names and ARIA usage (sections 14, 19). DOM logic: src/browser/semantics.ts. axe-core adds attribute and role validity. */
export const aria: Scanner = {
  test: 'aria', name: 'ARIA and accessible names',
  async run(ctx) {
    await ctx.scan('names');
    const { data } = await ctx.scan<Record<string, number>>('aria');
    Object.entries(data).forEach(([attr, n]) => { ctx.data.features['attr:' + attr] = n; });
  },
};
