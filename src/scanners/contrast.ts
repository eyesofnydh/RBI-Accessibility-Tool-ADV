import type { PageCtx, Scanner } from '../context';
import type { QuickText } from '../browser/states';
import type { ColorEntry, ContrastRow, ElementEvidence } from '../types';

const rgbOf = (hex: string) => (/^#[0-9A-F]{6}$/.test(hex) ? `rgb(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)})` : '');

/**
 * Hover and focus colours. Uses the DevTools protocol to force :hover, then :focus, on each link and button
 * (the same switch as "Force element state" in DevTools) and measures the text again.
 * Only colours that differ from the normal state are reported. Chromium only.
 */
async function stateContrast(ctx: PageCtx): Promise<void> {
  const { page } = ctx;
  const targets = await ctx.dom<{ ref: string; name: string }[]>('stateTargets', ctx.config.limits.maxStateChecks);
  if (!targets.length) return;
  const cdp = await ctx.context.newCDPSession(page);
  // Colour transitions would otherwise be measured half-way through.
  const style = await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; }' });
  const seen = new Set<string>();
  let shots = 0;
  try {
    await cdp.send('DOM.enable');
    await cdp.send('CSS.enable');
    const { root } = await cdp.send('DOM.getDocument', { depth: 0 });
    for (const t of targets) {
      const base = await ctx.dom<QuickText[]>('quickText', t.ref);
      const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: `[data-a11y-ref="${t.ref}"]` });
      if (!nodeId) continue;
      for (const [state, classes, words] of [['hover', ['hover'], 'mouse hover'], ['focus', ['focus', 'focus-visible'], 'keyboard focus']] as const) {
        await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [...classes] });
        const now = await ctx.dom<QuickText[]>('quickText', t.ref);
        for (let i = 0; i < now.length; i++) {
          const q = now[i], b = base[i];
          if (!b || !q.fg || (q.fg === b.fg && q.bg === b.bg)) continue; // same as the normal state: already measured
          const key = [state, q.fg, q.bg, q.required].join('|');
          if (seen.has(key)) continue;
          seen.add(key);
          const measurable = /^#/.test(q.fg) && /^#/.test(q.bg);
          ctx.data.contrast.push({
            url: ctx.url, ref: q.ref, selector: q.selector, check: `Text (${state})`, text: q.text, foregroundCss: q.fgCss, backgroundCss: q.bgCss,
            foreground: q.fg, background: q.bg, foregroundRgb: rgbOf(q.fg), backgroundRgb: rgbOf(q.bg), fontSize: q.size, fontWeight: q.weight, largeText: q.large,
            contrastRatio: q.ratio, requiredRatio: q.required, wcag: '1.4.3', status: q.status,
            note: [`Measured with ${words} forced on`, q.note].filter(Boolean).join('; '),
            webaim: measurable ? `https://webaim.org/resources/contrastchecker/?fcolor=${q.fg.slice(1)}&bcolor=${q.bg.slice(1)}` : '',
          });
          if (q.status === true) { ctx.collector.pass('contrast.state'); continue; }
          if (q.status === null || q.ratio === null) continue;
          ctx.collector.add([{
            rule: 'contrast.state', status: false, el: (await ctx.dom<ElementEvidence | null>('evidenceOf', q.ref)) || undefined,
            actual: `On ${words}: foreground ${q.fg} on ${q.bg} produces ${q.ratio.toFixed(2)}:1 (normal state: ${b.fg} on ${b.bg}).`,
            vars: { name: q.text, ratio: q.ratio.toFixed(2), required: q.required, state: words },
            screenshot: shots++ < 8 ? await ctx.shotElement(q.ref, 'WCAG-1.4.3', `${state}-${q.text}`) : '',
          }]);
        }
      }
      await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] });
    }
  } finally {
    await style.evaluate((el) => (el as Element).remove()).catch(() => undefined);
    await cdp.detach().catch(() => undefined);
  }
}

/**
 * Colour contrast from computed CSS (section 4) and the colour inventory (section 43).
 * DOM logic: src/browser/contrast.ts and src/browser/inventory.ts
 */
export const contrast: Scanner = {
  test: 'contrast', name: 'Colour contrast',
  async run(ctx) {
    const { data } = await ctx.scan<ContrastRow[]>('contrast', { borders: ctx.config.contrast.borders });
    ctx.data.contrast = data.map((r) => ({ ...r, url: ctx.url }));

    if (ctx.config.contrast.states && ctx.config.browser === 'chromium') {
      try { await stateContrast(ctx); } catch (e) { ctx.data.errors.push('Hover and focus colours: ' + (e as Error).message.split('\n')[0]); }
    }

    if (!ctx.config.tests.colorInventory) return;
    const inv = await ctx.dom<{ colors: ColorEntry[]; unreadable: string[] }>('colorInventory');
    if (inv.unreadable.length) ctx.data.errors.push(`Colour inventory: ${inv.unreadable.length} cross-origin stylesheet(s) could not be read (${inv.unreadable.slice(0, 3).join(', ')}). Colours used on the page are still captured from computed styles.`);
    // Merge into the run-wide inventory: stylesheets repeat on every page, so declarations are not summed.
    for (const c of inv.colors) {
      const e = ctx.run.colors.get(c.color);
      if (!e) { ctx.run.colors.set(c.color, c); continue; }
      e.occurrences = Math.max(e.occurrences, c.occurrences);
      e.usedBy += c.usedBy;
      for (const v of c.variables) if (!e.variables.includes(v) && e.variables.length < 8) e.variables.push(v);
      for (const u of c.usedAs) if (!e.usedAs.includes(u)) e.usedAs.push(u);
      for (const r of c.raw) if (!e.raw.includes(r) && e.raw.length < 4) e.raw.push(r);
      for (const s of c.sources) if (e.sources.length < 6 && !e.sources.some((x) => x.selector === s.selector && x.property === s.property)) e.sources.push(s);
    }
  },
};
