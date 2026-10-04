import type { Page } from 'playwright';
import type { PageCtx, Scanner } from '../context';
import { openPage } from '../context';
import type { ActiveInfo, ExpectedStop } from '../browser/focus';
import type { ElementEvidence, FocusStop, RawFinding } from '../types';
import { FocusJudge } from './focus';

const call = <T>(page: Page, fn: string, ...args: unknown[]): Promise<T> =>
  page.evaluate(([f, a]) => ((window as unknown as { __a11y: Record<string, (...x: unknown[]) => unknown> }).__a11y[f as string](...(a as unknown[]))) as never, [fn, args]) as Promise<T>;

/**
 * Presses Tab through the page and records where focus goes (sections 7, 31, 35).
 * Returns the stops so callers can report on them.
 */
export async function traverse(ctx: PageCtx, page: Page, label: string, maxStops: number, judge: FocusJudge | null, opts: { report?: boolean } = {}): Promise<{ stops: FocusStop[]; expected: ExpectedStop[]; complete: boolean }> {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.bringToFront().catch(() => undefined);
  const expected = await call<ExpectedStop[]>(page, 'focusSnapshot');
  const stops: FocusStop[] = [];
  const visited = new Set<string>();
  // report: false walks the page for the judge only (forced colours), without raising keyboard issues a second time.
  const add = (list: RawFinding[]) => (opts.report === false ? [] : ctx.collector.add(list, label, 'interaction'));
  let prev = '', same = 0, bodyHits = 0, complete = false, lostReported = false, bodyAfter: FocusStop | null = null;

  for (let step = 1; step <= maxStops; step++) {
    await page.keyboard.press('Tab');
    const info = await call<ActiveInfo>(page, 'activeInfo', false);
    if (info.isBody) {
      // Focus left the document. At the end of the page that is normal (the browser's own controls come next);
      // which case it is becomes clear from where the next Tab lands.
      if (++bodyHits >= 3) { complete = stops.length > 0; break; }
      bodyAfter = stops[stops.length - 1] || null;
      continue;
    }
    bodyHits = 0;
    if (stops.length > 0 && info.ref === stops[0].ref) { complete = true; break; } // wrapped round to the start
    if (bodyAfter && !visited.has(info.ref) && !lostReported) {
      lostReported = true;
      add([{ rule: 'keyboard.focus-lost', status: null, el: (await call<ElementEvidence | null>(page, 'evidenceOf', bodyAfter.ref)) || undefined, actual: `After step ${bodyAfter.step} ("${bodyAfter.name}") a Tab press left focus on the page body before it reached "${info.name}".` }]);
    }
    bodyAfter = null;
    if (info.ref === prev) {
      same++;
      if (info.tag === 'iframe' && same < 40) continue; // Tab is moving inside the frame
      if (same >= 2) {
        if (!info.inDialog) add([{ rule: 'keyboard.trap', status: false, el: (await call<ElementEvidence | null>(page, 'evidenceOf', info.ref)) || undefined, actual: `Tab was pressed ${same + 1} times and focus stayed on "${info.name}".` }]);
        break;
      }
      continue;
    }
    same = 0;
    if (visited.has(info.ref)) {
      // Focus is cycling inside part of the page.
      if (!info.inDialog) add([{ rule: 'keyboard.trap', status: false, confidence: 'probable', el: (await call<ElementEvidence | null>(page, 'evidenceOf', info.ref)) || undefined, actual: `After ${stops.length} stops, Tab returned to "${info.name}" without reaching the rest of the page (${expected.length} tab stops expected).` }]);
      else ctx.data.errors.push(`Keyboard (${label}): a dialog was open, so Tab stayed inside it. Stops outside the dialog were not reached.`);
      break;
    }
    visited.add(info.ref);
    prev = info.ref;
    stops.push({ step: stops.length + 1, ref: info.ref, selector: info.selector, name: info.name, role: info.role, tag: info.tag, boundingBox: info.box, inViewport: info.inViewport, visible: info.visible, obscuredBy: info.obscuredBy, indicator: info.indicators });

    if (!info.visible) {
      const el = (await call<ElementEvidence | null>(page, 'evidenceOf', info.ref)) || undefined;
      if (info.obscuredKind === 'pinned') {
        add([{ rule: 'focus.obscured', status: false, el, actual: `At ${label}, step ${stops.length}: "${info.name}" has focus but is completely covered by ${info.obscuredBy}.`, vars: { name: info.name, role: info.role, by: info.obscuredBy }, screenshot: await ctx.shotElement(info.ref, 'focus', info.name, '', page, true) }]);
      } else {
        const why = !info.inViewport ? 'it is outside the visible area' : info.obscuredBy ? `it is covered by ${info.obscuredBy}` : 'it has no visible box (zero size, transparent or clipped)';
        add([{ rule: 'focus.invisible-target', status: false, el, actual: `At ${label}, step ${stops.length}: focus is on "${info.name}" but ${why}${info.inCarousel ? '. The element is inside a carousel, which did not bring it into view' : ''}.`, vars: { name: info.name } }]);
      }
    } else if (opts.report !== false) ctx.collector.pass('focus.invisible-target');
    if (judge) await judge.onStop(info);
  }
  if (judge) await judge.finish();
  return { stops, expected, complete };
}

/** Keyboard access and focus order at desktop size, plus widget key tests and the click-listener check. */
export const keyboard: Scanner = {
  test: 'keyboard', name: 'Keyboard and focus',
  async run(ctx) {
    const { page, config } = ctx;
    const add = (list: RawFinding[]) => ctx.collector.add(list, 'desktop', 'interaction');
    const ev = async (ref: string) => (await ctx.dom<ElementEvidence | null>('evidenceOf', ref)) || undefined;

    // Start from a freshly loaded page, exactly as a keyboard user would: earlier scanners scrolled elements
    // into view for screenshots, and in Chrome that moves the point the first Tab press starts from.
    await openPage(ctx.run, page, ctx.url);
    const { stops, expected, complete } = await traverse(ctx, page, 'desktop', config.limits.maxTabStops, new FocusJudge(ctx, page));
    ctx.data.focusOrder = stops;
    ctx.collector.pass('keyboard.trap', stops.length ? 1 : 0);

    // Positive tabindex.
    const positive = expected.filter((e) => e.tabindex > 0);
    if (positive.length) add([{ rule: 'keyboard.tabindex-positive', status: null, el: await ev(positive[0].ref), count: positive.length, actual: `${positive.length} element(s) use tabindex above 0: ${positive.slice(0, 5).map((p) => `"${p.name}" (tabindex ${p.tabindex})`).join(', ')}.` }]);

    // Focus order against the visual order: flag moves that go up the page and not to the right.
    const jumps: string[] = [];
    for (let i = 1; i < stops.length; i++) {
      const a = stops[i - 1].boundingBox, b = stops[i].boundingBox;
      if (!a || !b) continue;
      if (b.y + b.height < a.y - 50 && b.x <= a.x + a.width) jumps.push(`step ${stops[i - 1].step} "${stops[i - 1].name.slice(0, 30)}" to step ${stops[i].step} "${stops[i].name.slice(0, 30)}" (moves up ${Math.round(a.y - b.y)}px)`);
    }
    if (jumps.length) add([{ rule: 'keyboard.order', status: null, count: jumps.length, actual: `${jumps.length} backward jump(s) in the focus path: ${jumps.slice(0, 5).join('; ')}.`, evidence: 'The full focus path is in the keyboard map of this page.' }]);
    else if (stops.length > 1) ctx.collector.pass('keyboard.order');

    // Tab stops that were expected but never reached.
    if (complete) {
      const reached = new Set(stops.map((s) => s.ref));
      const missed = expected.filter((e) => !reached.has(e.ref) && e.box && e.tag !== 'iframe');
      for (const m of missed.slice(0, 5)) add([{ rule: 'keyboard.unreached', status: null, el: await ev(m.ref), actual: `"${m.name}" looks tabbable but the Tab sequence (${stops.length} stops) never landed on it.` }]);
      ctx.collector.pass('keyboard.unreached', expected.length - missed.length);
    } else if (stops.length >= config.limits.maxTabStops) {
      ctx.data.errors.push(`Keyboard: stopped after ${config.limits.maxTabStops} Tab presses (limits.maxTabStops); the page has ${expected.length} tab stops.`);
    }

    // Shift+Tab should walk the same path backwards. Every mismatch is recorded once, then the walk carries on.
    if (stops.length >= 3) {
      const start = Math.min(stops.length - 1, 40);
      const mismatches: string[] = [];
      let walked = 0;
      if (await ctx.dom<boolean>('focusRef', stops[start].ref)) {
        for (let i = start - 1; i >= 0 && mismatches.length < 6; i--) {
          await page.keyboard.press('Shift+Tab');
          walked++;
          const info = await ctx.dom<ActiveInfo>('activeInfo', false);
          if (info.ref === stops[i].ref) continue;
          const at = stops.findIndex((s) => s.ref === info.ref);
          if (at >= 0 && at < i) {
            // Landed further back: some stops were skipped. Carry on from where focus is.
            mismatches.push(`from "${stops[i + 1].name.slice(0, 30)}" Shift+Tab went to "${info.name.slice(0, 30)}", skipping ${i - at} stop(s) (expected "${stops[i].name.slice(0, 30)}")`);
            i = at;
          } else {
            // Somewhere unexpected. Put focus on the expected stop and continue; if it cannot take focus any more, say so.
            const resynced = await ctx.dom<boolean>('focusRef', stops[i].ref).catch(() => false);
            mismatches.push(`from "${stops[i + 1].name.slice(0, 30)}" Shift+Tab went to "${(info.name || 'the page body').slice(0, 30)}" instead of "${stops[i].name.slice(0, 30)}"${resynced ? '' : ' (that stop can no longer take focus, for example because selecting a tab hid it)'}`);
            if (!resynced) { while (i > 0 && !(await ctx.dom<boolean>('focusRef', stops[i - 1].ref).catch(() => false))) i--; i--; }
          }
        }
        if (mismatches.length) add([{ rule: 'keyboard.reverse-order', status: null, count: mismatches.length, actual: `Walking back with Shift+Tab over ${walked} stop(s) differed from the Tab order ${mismatches.length} time(s): ${mismatches.join('; ')}.` }]);
        else ctx.collector.pass('keyboard.reverse-order', walked);
      }
    }

    // Composite widgets and expandable controls, following the pattern each one declares.
    const targets = await ctx.dom<{ tabs: { listRef: string; activeRef: string; name: string; rovingOnly: boolean; count: number }[]; toggles: { ref: string; name: string; role: string }[] }>('widgetTargets', config.limits.maxWidgetTests);
    for (const t of targets.tabs) {
      if (!(await ctx.dom<boolean>('focusRef', t.activeRef))) continue;
      let moved = false;
      const tried: string[] = [];
      for (const key of ['ArrowRight', 'ArrowDown', 'End', 'Home']) {
        await page.keyboard.press(key);
        const now = await ctx.dom<{ ref: string; inside: boolean }>('activeWithin', t.listRef);
        const did = now.inside && now.ref !== t.activeRef;
        tried.push(`${key}: ${did ? 'moved focus' : 'no move'}`);
        if (did) { moved = true; if (key.startsWith('Arrow')) break; }
      }
      if (!moved && t.rovingOnly) add([{ rule: 'keyboard.widget-unreachable', status: false, el: await ev(t.listRef), actual: `${t.count} items; only one is in the tab order and the arrow keys did not move focus (${tried.join(', ')}).`, vars: { name: t.name } }]);
      else ctx.collector.pass('keyboard.widget-unreachable');
    }
    const startUrl = page.url();
    for (const t of targets.toggles) {
      if (!(await ctx.dom<boolean>('focusRef', t.ref))) continue;
      const before = await ctx.dom<string | null>('attrOf', t.ref, 'aria-expanded');
      let after = before;
      for (const key of ['Enter', 'Space']) {
        await page.keyboard.press(key);
        await page.waitForTimeout(250);
        if (page.url() !== startUrl) break;
        after = await ctx.dom<string | null>('attrOf', t.ref, 'aria-expanded').catch(() => before);
        if (after !== before) break;
      }
      if (page.url() !== startUrl) { await page.goBack().catch(() => undefined); break; }
      if (after === before) add([{ rule: 'keyboard.widget-toggle', status: false, el: await ev(t.ref), actual: `aria-expanded stayed "${before}" after Enter and Space.`, vars: { name: t.name } }]);
      else {
        ctx.collector.pass('keyboard.widget-toggle');
        // Put it back the way it was: Escape first, then the same key.
        await page.keyboard.press('Escape');
        await page.waitForTimeout(150);
        if ((await ctx.dom<string | null>('attrOf', t.ref, 'aria-expanded').catch(() => before)) !== before) {
          await ctx.dom<boolean>('focusRef', t.ref).catch(() => false);
          await page.keyboard.press('Enter');
          await page.waitForTimeout(150);
        }
      }
    }

    // Things that react to a mouse click but cannot take keyboard focus.
    const cands = await ctx.dom<{ ref: string; onclick: boolean; ev: ElementEvidence }[]>('clickableCandidates', config.limits.maxClickableChecks);
    let unconfirmed = 0;
    const cdp = config.browser === 'chromium' ? await ctx.context.newCDPSession(page).catch(() => null) : null;
    for (const c of cands) {
      let listens = c.onclick;
      if (!listens && cdp) {
        try {
          const { result } = await cdp.send('Runtime.evaluate', { expression: `document.querySelector('[data-a11y-ref="${c.ref}"]')` });
          if (result.objectId) {
            const { listeners } = await cdp.send('DOMDebugger.getEventListeners', { objectId: result.objectId, depth: -1 });
            listens = listeners.some((l) => ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'touchstart', 'touchend'].includes(l.type));
          }
        } catch { /* leave as unconfirmed */ }
      }
      if (listens) add([{ rule: 'keyboard.not-focusable', status: false, el: c.ev, actual: `<${c.ev.tag}> has a click handler and a pointer cursor but no tabindex, no interactive role and no focusable child.`, vars: { name: c.ev.name || c.ev.text.slice(0, 50) } }]);
      else if (unconfirmed++ < 5) add([{ rule: 'keyboard.clickable-review', status: null, el: c.ev, actual: `<${c.ev.tag}> shows a pointer cursor but is not focusable. No click handler was found on it.` }]);
    }
    await cdp?.detach().catch(() => undefined);
    if (!cands.length) ctx.collector.pass('keyboard.not-focusable');
  },
};

/** Short Tab pass used at small viewports and at zoom: checks only that focus stays visible. */
export async function focusVisiblePass(ctx: PageCtx, page: Page, label: string): Promise<void> {
  await traverse(ctx, page, label, ctx.config.limits.smallViewportTabStops, null);
}
