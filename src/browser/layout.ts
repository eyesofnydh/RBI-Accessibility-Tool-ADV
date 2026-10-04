/** Layout checks used at small viewports and at zoom. Compared against a desktop baseline to keep noise down. */
import { clean, fail, isRendered, isVisible, nameOf, ownText, pass, review, selectorOf, tabbables, textOf } from './core';

export interface LayoutBaseline { truncated: string[]; overlaps: string[]; mainText: string[] }
export interface LayoutOptions {
  prefix: 'responsive' | 'zoom' | 'reflow' | 'spacing'; label: string; baseline: LayoutBaseline | null; checkTargets: boolean; fixedCoverRatio: number;
  /** Run only these checks: overflow, truncated, overlap, offscreen, hidden, fixed, targets. */
  only?: string[];
}

interface R { left: number; top: number; right: number; bottom: number }
const area = (r: R) => Math.max(0, r.right - r.left) * Math.max(0, r.bottom - r.top);

/** The part of the element that is actually painted, after every overflow-clipping ancestor. Page coordinates. */
function paintedRect(el: Element): { rect: R; pinned: boolean } | null {
  const b = el.getBoundingClientRect();
  let rect: R = { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
  let pinned = false;
  for (let a: Element | null = el; a && a !== document.documentElement; a = a.parentElement) {
    const cs = getComputedStyle(a);
    if (cs.position === 'fixed' || cs.position === 'sticky') pinned = true;
    if (a !== el && (cs.overflowX !== 'visible' || cs.overflowY !== 'visible')) {
      const c = a.getBoundingClientRect();
      if (cs.overflowX !== 'visible') { rect.left = Math.max(rect.left, c.left); rect.right = Math.min(rect.right, c.right); }
      if (cs.overflowY !== 'visible') { rect.top = Math.max(rect.top, c.top); rect.bottom = Math.min(rect.bottom, c.bottom); }
      if (rect.right - rect.left < 1 || rect.bottom - rect.top < 1) return null;
    }
  }
  rect = { left: rect.left + scrollX, right: rect.right + scrollX, top: rect.top + scrollY, bottom: rect.bottom + scrollY };
  return { rect, pinned };
}

/** Elements whose own text is cut off by their box or by a non-scrolling ancestor. */
function truncatedElements(): Element[] {
  const out: Element[] = [];
  document.querySelectorAll('body *').forEach((el) => {
    if (ownText(el).length < 3 || !isVisible(el) || el.closest('select, option, script, style, [aria-hidden="true"]')) return;
    const cs = getComputedStyle(el);
    const h = el as HTMLElement;
    if (h.clientWidth > 0) {
      const clipsX = cs.overflowX === 'hidden' || cs.overflowX === 'clip', clipsY = cs.overflowY === 'hidden' || cs.overflowY === 'clip';
      if ((clipsX && h.scrollWidth > h.clientWidth + 2) || (clipsY && h.scrollHeight > h.clientHeight + 4)) { out.push(el); return; }
    }
    const r = el.getBoundingClientRect();
    for (let a = el.parentElement, d = 0; a && d < 3; a = a.parentElement, d++) {
      const as = getComputedStyle(a);
      const hx = as.overflowX === 'hidden' || as.overflowX === 'clip', hy = as.overflowY === 'hidden' || as.overflowY === 'clip';
      if (!hx && !hy) continue;
      const c = a.getBoundingClientRect();
      const inside = r.right > c.left && r.left < c.right && r.bottom > c.top && r.top < c.bottom;
      if (!inside) return; // fully hidden: an off-screen slide or closed panel, not truncation
      if ((hx && (r.right > c.right + 4 || r.left < c.left - 4)) || (hy && r.bottom > c.bottom + 4)) { out.push(el); return; }
    }
  });
  return out;
}

interface Item { el: Element; rects: R[]; top: number; bottom: number; type: 'text' | 'img' | 'control'; carousel: boolean }

/** Painted boxes of an element, one per line for inline text that wraps. Page coordinates. */
function paintedLines(el: Element): { rects: R[]; pinned: boolean } | null {
  const whole = paintedRect(el);
  if (!whole) return null;
  const rects = Array.from(el.getClientRects()).map((c) => ({
    left: Math.max(c.left + scrollX, whole.rect.left), right: Math.min(c.right + scrollX, whole.rect.right),
    top: Math.max(c.top + scrollY, whole.rect.top), bottom: Math.min(c.bottom + scrollY, whole.rect.bottom),
  })).filter((r) => area(r) >= 16);
  return rects.length ? { rects, pinned: whole.pinned } : null;
}
/** Pairs of painted elements whose boxes overlap although neither contains the other. */
function overlappingPairs(): { a: Item; b: Item; key: string }[] {
  const items: Item[] = [];
  const add = (el: Element, type: Item['type']) => {
    if (items.length >= 1500 || !isVisible(el)) return;
    const p = paintedLines(el);
    if (!p || p.pinned) return;
    items.push({ el, rects: p.rects, top: Math.min(...p.rects.map((r) => r.top)), bottom: Math.max(...p.rects.map((r) => r.bottom)), type, carousel: !!el.closest('[aria-roledescription="carousel" i], [class*="carousel" i], [class*="swiper" i], [class*="slick" i], [class*="slider" i]') });
  };
  document.querySelectorAll('body *').forEach((el) => { if (ownText(el).length >= 2 && !el.closest('option, select, script, style')) add(el, 'text'); });
  document.querySelectorAll('img').forEach((el) => { const r = el.getBoundingClientRect(); if (r.width >= 24 && r.height >= 24) add(el, 'img'); });
  document.querySelectorAll('button, input:not([type="hidden"]), select, textarea').forEach((el) => add(el, 'control'));
  items.sort((x, y) => x.top - y.top);
  const hit = (a: Item, b: Item): boolean => a.rects.some((ra) => b.rects.some((rb) => {
    const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left), h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
    return w >= 4 && h >= 4 && (w * h) / Math.min(area(ra), area(rb)) >= 0.3;
  }));
  const pairs: { a: Item; b: Item; key: string }[] = [];
  for (let i = 0; i < items.length && pairs.length < 60; i++) {
    const a = items[i];
    for (let j = i + 1; j < items.length && items[j].top < a.bottom; j++) {
      const b = items[j];
      if (a.type === 'img' && b.type === 'img') continue;
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      if (!hit(a, b)) continue;
      pairs.push({ a, b, key: selectorOf(a.el) + ' | ' + selectorOf(b.el) });
    }
  }
  return pairs;
}

function mainTextElements(): Element[] {
  const root = document.querySelector('main, [role="main"]') || document.body;
  return Array.from(root.querySelectorAll('*')).filter((el) => ownText(el).length >= 20 && isVisible(el) && !el.closest('header, nav, footer, [aria-hidden="true"]')).slice(0, 400);
}

/** Taken once at desktop width; later viewports are compared against it. */
export function layoutSnapshot(): LayoutBaseline {
  return {
    truncated: truncatedElements().map(selectorOf),
    overlaps: overlappingPairs().map((p) => p.key),
    mainText: mainTextElements().map(selectorOf),
  };
}

export function scanLayout(o: LayoutOptions): { scrollWidth: number; clientWidth: number } {
  const p = o.prefix, at = o.label, vars = { viewport: at };
  const want = (k: string) => !o.only || o.only.includes(k);
  const de = document.documentElement;
  const scrollWidth = Math.max(de.scrollWidth, document.body?.scrollWidth || 0), clientWidth = de.clientWidth;

  // 1. Horizontal overflow.
  if (!want('overflow')) { /* skipped */ } else if (scrollWidth > clientWidth + 1) {
    const culprits: { el: Element; right: number }[] = [];
    document.querySelectorAll('body *').forEach((el) => {
      if (!isVisible(el)) return;
      const pr = paintedRect(el);
      if (!pr || pr.rect.right <= clientWidth + 1) return;
      if (Array.from(el.children).some((k) => { const kr = paintedRect(k); return !!kr && kr.rect.right > clientWidth + 1; })) return; // keep the innermost
      culprits.push({ el, right: Math.round(pr.rect.right) });
    });
    culprits.sort((a, b) => b.right - a.right);
    const top = culprits.slice(0, 5);
    const exempt = top.length > 0 && top.every((c) => c.el.closest('table, pre, iframe, canvas, svg, [role="table"], [role="grid"]'));
    const msg = `scrollWidth ${scrollWidth}px is larger than clientWidth ${clientWidth}px at ${at}.` + (top.length ? ` Widest content: ${top.map((c) => `${selectorOf(c.el)} (ends at ${c.right}px)`).join('; ')}.` : '');
    const extra = { vars: { ...vars, scrollWidth, clientWidth } };
    if (p === 'zoom' || exempt) review(`${p}.overflow`, top[0]?.el || null, msg + (exempt ? ' The overflowing content is a table, code block or graphic, which WCAG exempts from reflow.' : ''), extra);
    else fail(`${p}.overflow`, top[0]?.el || null, msg, extra);
  } else pass(`${p}.overflow`);

  // 2. Truncated text that was not truncated at desktop width.
  const before = new Set(o.baseline?.truncated || []);
  const cut = want('truncated') ? truncatedElements().filter((el) => !before.has(selectorOf(el))) : [];
  cut.slice(0, 10).forEach((el) => {
    const h = el as HTMLElement;
    fail(`${p}.truncated`, el, `At ${at} the text "${textOf(el, 60)}" is cut off (content ${h.scrollWidth}x${h.scrollHeight}px in a ${h.clientWidth}x${h.clientHeight}px box).`, { vars: { ...vars, name: textOf(el, 50) } });
  });
  if (cut.length > 10) fail(`${p}.truncated`, null, `${cut.length - 10} more truncated text elements at ${at}.`, { vars, count: cut.length - 10 });
  if (!cut.length && want('truncated')) pass(`${p}.truncated`);

  // 3. Overlaps that did not exist at desktop width.
  const known = new Set(o.baseline?.overlaps || []);
  const overlaps = want('overlap') ? overlappingPairs().filter((x) => !known.has(x.key)) : [];
  overlaps.slice(0, 6).forEach((x) => {
    const rule = x.a.carousel && x.b.carousel && p === 'responsive' ? 'responsive.carousel-overlay' : `${p}.overlap`;
    review(rule, x.a.el, `At ${at} the ${x.a.type} "${clean(textOf(x.a.el) || nameOf(x.a.el) || x.a.el.localName, 40)}" overlaps the ${x.b.type} "${clean(textOf(x.b.el) || nameOf(x.b.el) || x.b.el.localName, 40)}" (${selectorOf(x.b.el)}).`, { vars });
  });
  if (overlaps.length > 6) review(`${p}.overlap`, null, `${overlaps.length - 6} more overlapping pairs at ${at}.`, { vars, count: overlaps.length - 6 });
  if (!overlaps.length && want('overlap')) pass(`${p}.overlap`);

  // 4. Controls placed outside the page width.
  const off = !want('offscreen') ? [] : tabbables().filter((t) => {
    if (!isVisible(t)) return false;
    const pr = paintedRect(t);
    return !!pr && !pr.pinned && (pr.rect.left >= clientWidth - 1 || pr.rect.right <= 1);
  });
  off.slice(0, 5).forEach((t) => review(`${p}.offscreen`, t, `At ${at} the control "${clean(nameOf(t) || textOf(t), 40)}" starts at x=${Math.round(t.getBoundingClientRect().left + scrollX)}px, outside the ${clientWidth}px page width.`, { vars }));
  if (!off.length && want('offscreen')) pass(`${p}.offscreen`);

  // 5. Main content that was visible at desktop width and is no longer rendered.
  if (o.baseline && want('hidden')) {
    const gone = o.baseline.mainText.map((s) => { try { return document.querySelector(s); } catch { return null; } }).filter((el): el is Element => !!el && !isRendered(el));
    if (gone.length) review(`${p}.hidden-content`, null, `At ${at}, ${gone.length} text block(s) from the main content are no longer rendered, for example "${clean(gone[0].textContent, 60)}" (${selectorOf(gone[0])}).`, { vars, count: gone.length });
    else pass(`${p}.hidden-content`);
  }

  // 6. Fixed and sticky bars covering the viewport.
  let covered = 0;
  const pinnedEls: Element[] = [];
  document.querySelectorAll('body *').forEach((el) => {
    const cs = getComputedStyle(el);
    if (cs.position !== 'fixed' && !(cs.position === 'sticky' && (cs.top !== 'auto' || cs.bottom !== 'auto'))) return;
    if (!isVisible(el) || pinnedEls.some((x) => x.contains(el))) return;
    const r = el.getBoundingClientRect();
    if (r.width < innerWidth * 0.8 || r.height < 8 || r.height > innerHeight * 0.95) return;
    pinnedEls.push(el);
    covered += r.height;
  });
  const share = covered / innerHeight;
  if (!want('fixed')) { /* skipped */ } else if (share >= o.fixedCoverRatio) review(`${p}.fixed-cover`, pinnedEls[0], `At ${at}, fixed or sticky elements cover ${Math.round(share * 100)}% of the viewport height (${Math.round(covered)}px of ${innerHeight}px): ${pinnedEls.slice(0, 3).map(selectorOf).join('; ')}.`, { vars });
  else pass(`${p}.fixed-cover`);

  // 7. Small pointer targets.
  if (o.checkTargets && want('targets')) {
    const small = tabbables().filter((t) => {
      if (!isVisible(t)) return false;
      const r = t.getBoundingClientRect();
      if (r.width >= 24 && r.height >= 24) return false;
      const inline = getComputedStyle(t).display === 'inline' && !!t.parentElement && ownText(t.parentElement).length >= 20;
      return !inline;
    });
    if (small.length) review(`${p}.small-target`, small[0], `At ${at}, ${small.length} control(s) are smaller than 24x24 CSS px, for example ${small.slice(0, 5).map((t) => { const r = t.getBoundingClientRect(); return `"${clean(nameOf(t) || textOf(t), 25)}" (${Math.round(r.width)}x${Math.round(r.height)})`; }).join(', ')}.`, { vars, count: small.length });
    else pass(`${p}.small-target`);
  }
  return { scrollWidth, clientWidth };
}
