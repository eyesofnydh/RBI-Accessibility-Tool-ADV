import type { Scanner } from '../context';

/** Labels, required state, error association, fieldset and legend (sections 17, 18, 35). DOM logic: src/browser/semantics.ts */
export const forms: Scanner = {
  test: 'forms', name: 'Forms',
  async run(ctx) {
    await ctx.scan('forms');
    ctx.data.features.formFields = await ctx.page.locator('input:not([type="hidden"]), select, textarea').count();
  },
};
