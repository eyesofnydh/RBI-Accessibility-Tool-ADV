import type { Scanner } from '../context';

/**
 * Link purpose, empty and placeholder links, new-tab and external links, breadcrumbs (sections 15, 16, 23).
 * DOM logic: src/browser/semantics.ts
 */
export const links: Scanner = {
  test: 'links', name: 'Links',
  async run(ctx) {
    const { data } = await ctx.scan<{ type: string; target: string | null }[]>('links', ctx.config.site.internalHosts);
    ctx.data.links = data;
    ctx.data.features.links = data.length;
    ctx.data.features.externalLinks = data.filter((l) => l.type === 'external').length;
    ctx.data.features.newTabLinks = data.filter((l) => (l.target || '').toLowerCase() === '_blank').length;
  },
};
