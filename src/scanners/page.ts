import type { Scanner } from '../context';

/** Page title, language, language of parts, duplicate ids (sections 22, 33, 34). DOM logic: src/browser/structure.ts */
export const pageMeta: Scanner = {
  test: 'page', name: 'Page title, language and ids',
  async run(ctx) { await ctx.scan('pageMeta'); },
};
