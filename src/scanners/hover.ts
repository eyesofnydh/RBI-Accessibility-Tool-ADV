import type { Scanner } from '../context';
import type { ElementEvidence } from '../types';

/**
 * Content on hover or focus (WCAG 1.4.13): tooltips and similar pop-ups.
 * Each one is opened by hovering (or focusing) its trigger, then checked three ways:
 *   dismissible  Escape hides it without moving the pointer
 *   hoverable    the pointer can move onto it without it disappearing
 *   persistent   it stays while the pointer rests on the trigger
 * The browser's own title-attribute tooltips are exempt and are not tested.
 */
export const hoverContent: Scanner = {
  test: 'hoverContent', name: 'Content on hover or focus',
  async run(ctx) {
    const { page } = ctx;
    const targets = await ctx.dom<{ triggerRef: string; tipRef: string; name: string }[]>('tooltipTargets', ctx.config.limits.maxTooltips);
    ctx.data.features.tooltips = targets.length;
    const shown = (ref: string) => ctx.dom<boolean>('visibleNow', ref).catch(() => false);
    for (const t of targets) {
      const trigger = page.locator(`[data-a11y-ref="${t.triggerRef}"]`);
      const open = async (): Promise<'hover' | 'focus' | ''> => {
        await trigger.hover({ timeout: 2000 }).catch(() => undefined);
        await page.waitForTimeout(350);
        if (await shown(t.tipRef)) return 'hover';
        await ctx.dom<boolean>('focusRef', t.triggerRef).catch(() => false);
        await page.waitForTimeout(350);
        return (await shown(t.tipRef)) ? 'focus' : '';
      };
      const how = await open();
      if (!how) continue; // it does not open on hover or focus, so 1.4.13 does not apply
      const problems: string[] = [];

      await page.waitForTimeout(1500);
      if (!(await shown(t.tipRef))) problems.push('disappears by itself after about a second');
      else {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(250);
        if (await shown(t.tipRef)) problems.push('cannot be dismissed with Escape');
      }
      if (how === 'hover') {
        await page.mouse.move(0, 0);
        await page.waitForTimeout(200);
        if (await open()) {
          const c = await ctx.dom<{ x: number; y: number } | null>('centreOf', t.tipRef);
          if (c) {
            await page.mouse.move(c.x, c.y, { steps: 8 });
            await page.waitForTimeout(350);
            if (!(await shown(t.tipRef))) problems.push('disappears when the pointer moves onto it');
          }
        }
      }
      await page.mouse.move(0, 0);
      await page.keyboard.press('Escape').catch(() => undefined);
      await ctx.dom('blurActive').catch(() => undefined);

      if (!problems.length) { ctx.collector.pass('hover.content'); continue; }
      ctx.collector.add([{
        rule: 'hover.content', status: false, el: (await ctx.dom<ElementEvidence | null>('evidenceOf', t.triggerRef)) || undefined,
        actual: `The tooltip opened on ${how}. It ${problems.join(', and ')}.`, vars: { name: t.name, problem: problems.join(', and ') },
      }], 'desktop', 'interaction');
    }
  },
};
