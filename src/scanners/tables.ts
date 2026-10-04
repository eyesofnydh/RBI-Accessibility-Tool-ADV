import type { Scanner } from '../context';

/** Table headers, captions and associations (section 12). DOM logic: src/browser/structure.ts */
export const tables: Scanner = {
  test: 'tables', name: 'Tables',
  async run(ctx) {
    const { data } = await ctx.scan<unknown[]>('tables');
    ctx.data.tables = data;
    ctx.data.features.tables = data.length;
  },
};
