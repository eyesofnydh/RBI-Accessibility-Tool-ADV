import type { Scanner } from '../context';
import { openPage } from '../context';
import type { ElementEvidence, RawFinding } from '../types';

interface ErrorState { nativeInvalid: number; ariaInvalid: number; unlinked: string[]; errors: { text: string; exposed: boolean; ref: string }[]; focusOnField: boolean; liveUpdated: boolean }

/**
 * Form error handling (WCAG 3.3.1). Each form with required or typed fields is submitted empty and the result is inspected.
 * Nothing is sent to the server: while this test runs, every request that carries data (anything that is not a plain GET,
 * and every page navigation) is blocked. Search forms are left to the search test.
 */
export const formErrors: Scanner = {
  test: 'formErrors', name: 'Form error handling',
  async run(ctx) {
    const { page, config } = ctx;
    const forms = await ctx.dom<{ formRef: string; submitRef: string; name: string; fields: number; native: boolean }[]>('formTargets', config.limits.maxForms);
    if (!forms.length) return;
    const add = (list: RawFinding[]) => ctx.collector.add(list, 'desktop', 'interaction');
    let blocked = 0;
    await page.route('**/*', (route) => {
      const req = route.request();
      if (req.method() !== 'GET' || (req.isNavigationRequest() && req.frame() === page.mainFrame())) { blocked++; return route.abort(); }
      return route.continue();
    });
    try {
      for (const f of forms) {
        const before = await ctx.dom<string[]>('formErrorBaseline', f.formRef);
        await page.locator(`[data-a11y-ref="${f.submitRef}"]`).click({ timeout: 2500 }).catch(() => undefined);
        await page.waitForTimeout(700);
        const st = await ctx.dom<ErrorState>('formErrorState', f.formRef, before).catch(() => null);
        if (!st) continue;
        const el = (await ctx.dom<ElementEvidence | null>('evidenceOf', f.formRef)) || undefined;
        const hidden = st.errors.filter((e) => !e.exposed);

        if (st.unlinked.length) add([{ rule: 'forms.error-association', status: false, el, actual: `After an empty submit, ${st.unlinked.length} field(s) have aria-invalid="true" with no aria-describedby or aria-errormessage: ${st.unlinked.slice(0, 4).map((n) => `"${n}"`).join(', ')}.` }]);
        if (hidden.length && !st.focusOnField && !st.liveUpdated) {
          add([{ rule: 'forms.error-not-exposed', status: false, el, actual: `After an empty submit, ${hidden.length} error message(s) appeared (for example "${hidden[0].text}"). None is linked to a field or inside a live region, ${st.ariaInvalid ? '' : 'no field has aria-invalid, '}and focus did not move to a field in error.`, vars: { name: f.name }, screenshot: await ctx.shotElement(hidden[0].ref, 'WCAG-3.3.1', 'form-error') }]);
        } else if (st.errors.length || st.ariaInvalid) {
          ctx.collector.pass('forms.error-not-exposed');
          add([{ rule: 'sr.announcement', status: null, el, actual: `Form errors: ${st.errors.length} message(s) shown after an empty submit and exposed (linked to their field, in a live region, or focus moved to the field). Programmatic accessibility markup: PASS.`, vars: { feature: 'Error announcement' } }]);
        } else if (st.nativeInvalid > 0) {
          // The browser's own validation stopped the submit; its messages are exposed to assistive technology.
          ctx.collector.pass('forms.error-not-exposed');
        } else {
          ctx.data.errors.push(`Form error test: submitting "${f.name}" empty showed no error message and marked no field invalid, so error handling could not be checked.`);
        }
      }
    } finally {
      await page.unroute('**/*').catch(() => undefined);
      ctx.data.features.formsSubmitted = forms.length;
      if (blocked) ctx.data.errors.push(`Form error test: ${blocked} data-carrying request(s) were blocked, so nothing was sent to the server.`);
      await openPage(ctx.run, page, ctx.url);
    }
  },
};
