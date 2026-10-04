import type { Scanner } from '../context';

/** List markup checks (section 11). DOM logic: src/browser/structure.ts */
export const lists: Scanner = {
  test: 'lists', name: 'Lists',
  async run(ctx) { await ctx.scan('lists'); },
};
