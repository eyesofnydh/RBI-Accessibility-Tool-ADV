import type { Scanner } from '../context';
import { openPage } from '../context';
import type { ElementEvidence, RawFinding } from '../types';

interface DialogState { open: boolean; focusInside: boolean; name: string; tabStops: number; backgroundBlocked: boolean; closeRef: string }

/**
 * Modal dialogs (section 21).
 * Static: every dialog has an accessible name.
 * Interactive: opens each configured or auto-detected trigger with the keyboard and checks that focus moves in,
 * stays in while tabbing, that Escape closes it and that focus returns to the trigger.
 */
export const modal: Scanner = {
  test: 'modals', name: 'Modal dialogs',
  async run(ctx) {
    const { page, config } = ctx;
    const { data } = await ctx.scan<{ ref: string }[]>('modals');
    ctx.data.features.dialogs = data.length;
    const add = (list: RawFinding[]) => ctx.collector.add(list, 'desktop', 'interaction');
    const ev = async (ref: string) => (await ctx.dom<ElementEvidence | null>('evidenceOf', ref)) || undefined;

    const triggers: { name: string; ref: string }[] = [];
    for (const t of config.modals.triggers) {
      const found = await ctx.dom<ElementEvidence | null>('axeEvidence', t.open);
      if (found) triggers.push({ name: t.name, ref: found.ref });
      else ctx.data.errors.push(`Modal test: the trigger "${t.name}" (${t.open}) was not found on this page.`);
    }
    if (config.modals.autoDetect) for (const ref of await ctx.dom<string[]>('dialogTriggers', config.modals.max)) if (!triggers.some((t) => t.ref === ref)) triggers.push({ name: 'auto-detected trigger', ref });

    const waitForDialog = async (before: string[]): Promise<string> => {
      for (let i = 0; i < 10; i++) {
        await page.waitForTimeout(200);
        const now = await ctx.dom<string[]>('openDialogs').catch(() => [] as string[]);
        const opened = now.find((r) => !before.includes(r));
        if (opened) return opened;
      }
      return '';
    };

    for (const t of triggers.slice(0, config.modals.max)) {
      const startUrl = page.url();
      const before = await ctx.dom<string[]>('openDialogs');
      if (!(await ctx.dom<boolean>('focusRef', t.ref))) continue;
      await page.keyboard.press('Enter');
      let dialog = await waitForDialog(before);
      if (page.url() !== startUrl) { await openPage(ctx.run, page, ctx.url); continue; }
      if (!dialog) {
        await page.locator(`[data-a11y-ref="${t.ref}"]`).click({ timeout: 2000 }).catch(() => undefined);
        dialog = await waitForDialog(before);
        if (page.url() !== startUrl) { await openPage(ctx.run, page, ctx.url); continue; }
        if (dialog) add([{ rule: 'keyboard.widget-toggle', status: false, el: await ev(t.ref), actual: 'Pressing Enter on the control did not open the dialog; a mouse click did.', vars: { name: t.name } }]);
      }
      if (!dialog) { ctx.data.errors.push(`Modal test: "${t.name}" did not open a dialog.`); continue; }

      const st = await ctx.dom<DialogState>('dialogState', dialog);
      const dialogEv = await ev(dialog);
      const shot = await ctx.shotElement(dialog, 'WCAG-2.4.3', 'dialog-' + (st.name || t.name));
      if (!st.focusInside) add([{ rule: 'modal.focus-in', status: false, el: dialogEv, screenshot: shot, actual: 'After the dialog opened, document.activeElement was outside the dialog.', vars: { name: st.name || t.name } }]);
      else ctx.collector.pass('modal.focus-in');

      // Tab forwards through the dialog and a little further, then backwards.
      let escapedTo = '';
      const presses = Math.min(st.tabStops + 2, 25);
      for (const key of [...Array(presses).fill('Tab'), 'Shift+Tab', 'Shift+Tab']) {
        await page.keyboard.press(key);
        const now = await ctx.dom<{ ref: string; inside: boolean; name: string }>('activeWithin', dialog);
        if (now.ref && !now.inside) { escapedTo = now.name || 'an element behind the dialog'; break; }
      }
      if (escapedTo) add([{ rule: 'modal.focus-escape', status: false, el: dialogEv, screenshot: shot, actual: `While the dialog was open, Tab moved focus to "${escapedTo}" behind it.`, vars: { name: st.name || t.name, to: escapedTo } }]);
      else ctx.collector.pass('modal.focus-escape');
      if (!st.backgroundBlocked) add([{ rule: 'modal.background', status: null, el: dialogEv, actual: 'The dialog is not a native modal, has no aria-modal="true", and the content behind it is not inert or aria-hidden.' }]);

      // Close it and see where focus goes.
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
      let stillOpen = (await ctx.dom<DialogState>('dialogState', dialog)).open;
      if (stillOpen) {
        add([{ rule: 'modal.escape', status: null, el: dialogEv, actual: 'The dialog stayed open after Escape was pressed.' }]);
        if (st.closeRef) { await page.locator(`[data-a11y-ref="${st.closeRef}"]`).click({ timeout: 2000 }).catch(() => undefined); await page.waitForTimeout(500); }
        stillOpen = (await ctx.dom<DialogState>('dialogState', dialog).catch(() => ({ open: false } as DialogState))).open;
      }
      if (stillOpen) { await openPage(ctx.run, page, ctx.url); continue; }
      const back = await ctx.dom<{ ref: string }>('activeWithin', t.ref);
      if (back.ref === t.ref) ctx.collector.pass('modal.focus-return');
      else add([{ rule: 'modal.focus-return', status: false, el: await ev(t.ref), actual: 'After the dialog closed, focus was not on the control that opened it.' }]);
    }
  },
};
