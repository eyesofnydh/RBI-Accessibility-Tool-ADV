import type { Scanner } from '../context';

/**
 * Markup that affects what a screen reader reads: hidden content still exposed, date-range separators,
 * link and date grouping (sections 20, 27, 29). These are mostly MANUAL_REVIEW by design:
 * the tool checks markup, the tester confirms the speech with the screen reader.
 * DOM logic: src/browser/semantics.ts and src/browser/widgets.ts
 */
export const screenReader: Scanner = {
  test: 'screenReader', name: 'Screen reader markup',
  async run(ctx) {
    await ctx.scan('hidden');
    const dates = await ctx.scan('dates');
    await ctx.scan('linkDates');
    ctx.data.features.dateRanges = dates.findings.reduce((n, f) => n + (f.count || 1), 0);
  },
};
