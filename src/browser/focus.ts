/** Keyboard and focus helpers. The Node side presses the keys; these functions report what the page did. */
import type { Box, ElementEvidence } from '../types';
import { FOCUS_SELECTOR, REF_ATTR, boxOf, byRef, clean, evidence, isFocusable, isNativeInteractive, isVisible, nameOf, refOf, roleOf, selectorOf, tabbables, textOf } from './core';
import { RGBA, floor2, over, parseColor, ratio, rnd, solidBehind } from './color';
import { ringColours } from './contrast';
import { DIALOG_SEL } from './widgets';

interface Snap { outline: string; shadow: string; border: string; bg: string; color: string; deco: string; weight: string; before: string; after: string }
function snap(el: Element): Snap {
  const cs = getComputedStyle(el);
  const pseudo = (p: string) => { const s = getComputedStyle(el, p); return s.content === 'none' ? '' : [s.content, s.backgroundColor, s.borderTopColor, s.borderBottomWidth, s.borderBottomColor, s.boxShadow, s.outlineStyle, s.outlineColor, s.opacity, s.width, s.transform].join('|'); };
  return {
    outline: cs.outlineStyle === 'none' || parseFloat(cs.outlineWidth) === 0 ? 'none' : [cs.outlineStyle, cs.outlineWidth, cs.outlineColor, cs.outlineOffset].join(' '),
    shadow: cs.boxShadow,
    border: ['Top', 'Right', 'Bottom', 'Left'].map((s) => { const k = s.toLowerCase(); return [cs.getPropertyValue(`border-${k}-width`), cs.getPropertyValue(`border-${k}-style`), cs.getPropertyValue(`border-${k}-color`)].join(' '); }).join(','),
    bg: cs.backgroundColor + ' ' + cs.backgroundImage,
    color: cs.color,
    deco: cs.textDecorationLine,
    weight: cs.fontWeight,
    before: pseudo('::before'),
    after: pseudo('::after'),
  };
}

let unfocused = new WeakMap<Element, { self: Snap; parent: Snap | null; proxy: Snap | null }>();

/** For a visually hidden checkbox, radio or file input: the label or sibling that is drawn in its place. */
function proxyOf(el: Element): Element | null {
  if (el.localName !== 'input') return null;
  const input = el as HTMLInputElement;
  const cands = [input.labels?.[0], el.nextElementSibling, el.parentElement].filter((c): c is Element => !!c);
  return cands.find(isVisible) || null;
}

export interface ExpectedStop { ref: string; selector: string; name: string; role: string; tag: string; tabindex: number; box: Box | null }
/** Records how every Tab stop looks before it has focus, and returns the expected Tab stops. */
export function focusSnapshot(): ExpectedStop[] {
  unfocused = new WeakMap();
  (document.activeElement as HTMLElement | null)?.blur?.();
  return tabbables().map((el) => {
    const px = proxyOf(el);
    unfocused.set(el, { self: snap(el), parent: el.parentElement ? snap(el.parentElement) : null, proxy: px ? snap(px) : null });
    return { ref: refOf(el), selector: selectorOf(el), name: nameOf(el) || textOf(el, 60), role: roleOf(el), tag: el.localName, tabindex: el.tabIndex, box: boxOf(el) };
  });
}

function deepActive(): Element | null {
  let a: Element | null = document.activeElement;
  while (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement;
  return a;
}

export interface ActiveInfo {
  isBody: boolean; ref: string; selector: string; name: string; role: string; tag: string; box: Box | null;
  viewportBox: Box | null; inViewport: boolean; visible: boolean; obscuredBy: string; obscuredKind: '' | 'pinned' | 'other';
  indicators: string[]; strong: boolean; indicatorRatio: number | null; weakRatio: number | null; indicatorNote: string; known: boolean;
  isLink: boolean; underlineOnFocus: boolean; colourChanged: boolean; inDialog: boolean; inCarousel: boolean; ev: ElementEvidence | null;
}

/** Describes the element that has focus right now, including its focus indicator. */
export function activeInfo(withEvidence: boolean): ActiveInfo {
  const el = deepActive();
  const empty: ActiveInfo = { isBody: true, ref: '', selector: 'body', name: '', role: '', tag: 'body', box: null, viewportBox: null, inViewport: false, visible: false, obscuredBy: '', obscuredKind: '', indicators: [], strong: false, indicatorRatio: null, weakRatio: null, indicatorNote: '', known: false, isLink: false, underlineOnFocus: false, colourChanged: false, inDialog: false, inCarousel: false, ev: null };
  if (!el || el === document.body || el === document.documentElement) return empty;
  const r = el.getBoundingClientRect();
  const inViewport = r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;

  // Is it covered? Sample five points and see what is painted on top.
  let obscuredBy = '', obscuredKind: ActiveInfo['obscuredKind'] = '';
  if (inViewport) {
    const pts: [number, number][] = [[0.5, 0.5], [0.15, 0.25], [0.85, 0.25], [0.15, 0.75], [0.85, 0.75]];
    let hidden = 0, cover: Element | null = null, sampled = 0;
    for (const [fx, fy] of pts) {
      const x = r.left + r.width * fx, y = r.top + r.height * fy;
      if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
      sampled++;
      const hit: Element | null = document.elementFromPoint(x, y);
      if (!hit) continue;
      if (hit === el || el.contains(hit) || hit.contains(el)) continue;
      const label: HTMLLabelElement | null = hit.closest('label');
      if (label && (label.contains(el) || label.control === el)) continue;
      hidden++; cover = hit;
    }
    if (sampled > 0 && hidden === sampled && cover) {
      let pinned: Element | null = null;
      for (let a: Element | null = cover; a; a = a.parentElement) { const pos = getComputedStyle(a).position; if (pos === 'fixed' || pos === 'sticky') { pinned = a; break; } }
      obscuredBy = selectorOf(pinned || cover);
      obscuredKind = pinned ? 'pinned' : 'other';
    }
  }
  // A hidden native checkbox/radio is fine when a visible label or sibling stands in for it.
  const proxy = !isVisible(el) ? proxyOf(el) : null;
  const visible = proxy ? true : isVisible(el) && inViewport && obscuredKind !== 'other';

  // Focus indicator: compare with how it looked before focus.
  const base = unfocused.get(el);
  const now = snap(el);
  const cs = getComputedStyle(el);
  const indicators: string[] = [];
  const candidates: RGBA[] = [];
  let auto = false;
  if (now.outline !== 'none' && (!base || base.self.outline !== now.outline)) {
    indicators.push('outline');
    if (cs.outlineStyle === 'auto') auto = true;
    const c = parseColor(cs.outlineColor);
    if (c && c.a > 0) candidates.push(c);
  }
  if (base) {
    if (base.self.shadow !== now.shadow && now.shadow !== 'none') { indicators.push('box-shadow'); ringColours(cs.boxShadow).forEach((c) => candidates.push(c)); }
    if (base.self.border !== now.border) {
      indicators.push('border');
      for (const side of ['top', 'right', 'bottom', 'left']) { if (parseFloat(cs.getPropertyValue(`border-${side}-width`)) > 0) { const c = parseColor(cs.getPropertyValue(`border-${side}-color`)); if (c && c.a > 0) candidates.push(c); } }
    }
    if (!/underline/.test(base.self.deco) && /underline/.test(now.deco)) indicators.push('underline');
    if (base.self.bg !== now.bg) indicators.push('background change');
    if (base.self.color !== now.color) indicators.push('colour change');
    if (base.self.weight !== now.weight) indicators.push('font weight');
    if (base.self.before !== now.before || base.self.after !== now.after) indicators.push('pseudo-element');
    const p = el.parentElement;
    if (p && base.parent) { const ps = snap(p); if (ps.outline !== base.parent.outline || ps.shadow !== base.parent.shadow || ps.border !== base.parent.border || ps.bg !== base.parent.bg) indicators.push('parent container'); }
  }
  let proxyStrong = false;
  if (proxy && base?.proxy) {
    const ps = snap(proxy);
    if (ps.outline !== base.proxy.outline || ps.shadow !== base.proxy.shadow || ps.border !== base.proxy.border || ps.before !== base.proxy.before || ps.after !== base.proxy.after) { indicators.push('label or sibling outline'); proxyStrong = true; }
    else if (ps.bg !== base.proxy.bg || ps.color !== base.proxy.color) indicators.push('label or sibling colour');
  }
  // For colour-only changes, measure how different the old and new colours are.
  let weakRatio: number | null = null;
  if (base) {
    const first = (v: string) => parseColor((v.match(/rgba?\([^)]*\)/) || [''])[0]);
    const pairs: [RGBA | null, RGBA | null][] = [];
    if (base.self.bg !== now.bg) pairs.push([first(base.self.bg), first(now.bg)]);
    if (base.self.color !== now.color) pairs.push([parseColor(base.self.color), parseColor(now.color)]);
    const behind = solidBehind(el, false).color;
    for (const [a, b] of pairs) if (a && b) weakRatio = Math.max(weakRatio || 0, floor2(ratio(rnd(over(a, behind)), rnd(over(b, behind)))));
  }
  const strongKinds = indicators.filter((i) => ['outline', 'box-shadow', 'border', 'underline', 'label or sibling outline'].includes(i));
  let indicatorRatio: number | null = null, indicatorNote = '';
  if (strongKinds.length) {
    const { color: outer, bd } = solidBehind(el, false);
    if (proxyStrong && !candidates.length) indicatorNote = 'Indicator is drawn on the label or sibling element.';
    else if (auto) indicatorNote = 'Browser default focus ring (two-tone), treated as sufficient.';
    else if (bd.image) indicatorNote = 'Indicator sits on an image; contrast not measurable.';
    else if (candidates.length) {
      indicatorRatio = floor2(Math.max(...candidates.map((c) => ratio(rnd(over(c, outer)), outer))));
      indicatorNote = `Best indicator colour against the background is ${indicatorRatio.toFixed(2)}:1.`;
    } else if (strongKinds.includes('underline')) {
      const c = parseColor(cs.textDecorationColor) || parseColor(cs.color);
      if (c) { indicatorRatio = floor2(ratio(rnd(over(c, outer)), outer)); indicatorNote = `Underline colour against the background is ${indicatorRatio.toFixed(2)}:1.`; }
    }
  }
  return {
    isBody: false, ref: refOf(el), selector: selectorOf(el), name: nameOf(el) || textOf(el, 60), role: roleOf(el), tag: el.localName, box: boxOf(el),
    viewportBox: { x: r.left, y: r.top, width: r.width, height: r.height }, inViewport, visible, obscuredBy, obscuredKind,
    indicators, strong: strongKinds.length > 0, indicatorRatio, weakRatio, indicatorNote, known: !!base,
    isLink: roleOf(el) === 'link', underlineOnFocus: /underline/.test(now.deco), colourChanged: !!base && base.self.color !== now.color,
    inDialog: !!el.closest(DIALOG_SEL), inCarousel: !!el.closest('[aria-roledescription="carousel" i], [class*="carousel" i], [class*="swiper" i], [class*="slick" i], [class*="slider" i]'),
    ev: withEvidence ? evidence(el) : null,
  };
}

/** Elements that show a pointer cursor but cannot take focus. The Node side checks them for click listeners. */
export function clickableCandidates(max: number): { ref: string; onclick: boolean; ev: ElementEvidence }[] {
  const INTERACTIVE = 'a[href], button, label, summary, select, input, textarea, option, [tabindex], [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="option"], [role="checkbox"], [role="radio"], [role="switch"], [contenteditable]';
  const out: { ref: string; onclick: boolean; ev: ElementEvidence }[] = [];
  document.querySelectorAll('body *').forEach((el) => {
    if (out.length >= max) return;
    const cs = getComputedStyle(el);
    if (cs.cursor !== 'pointer') return;
    const p = el.parentElement;
    if (p && getComputedStyle(p).cursor === 'pointer') return; // only the top of a pointer area
    if (el.closest(INTERACTIVE) || isNativeInteractive(el) || !isVisible(el)) return;
    if (Array.from(el.querySelectorAll(FOCUS_SELECTOR)).some(isFocusable)) return; // a real control inside does the job
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8 || el.closest('[aria-hidden="true"]')) return;
    out.push({ ref: refOf(el), onclick: el.hasAttribute('onclick'), ev: evidence(el) });
  });
  return out;
}

const DESTRUCTIVE = /(delete|remove|submit|log ?out|sign ?out|pay|send|download|print|reset|clear|unsubscribe)/i;

/** Composite widgets and disclosure controls that are safe to exercise with the keyboard. */
export function widgetTargets(max: number): { tabs: { listRef: string; activeRef: string; name: string; rovingOnly: boolean; count: number }[]; toggles: { ref: string; name: string; role: string }[] } {
  const tabs: { listRef: string; activeRef: string; name: string; rovingOnly: boolean; count: number }[] = [];
  document.querySelectorAll('[role="tablist"], [role="menubar"], [role="listbox"], [role="radiogroup"]').forEach((list) => {
    if (tabs.length >= max || !isVisible(list)) return;
    const itemRole = { tablist: 'tab', menubar: 'menuitem', listbox: 'option', radiogroup: 'radio' }[list.getAttribute('role')!]!;
    const items = Array.from(list.querySelectorAll<HTMLElement>(`[role="${itemRole}"]`)).filter(isVisible);
    if (items.length < 2) return;
    const active = items.find((i) => i.tabIndex >= 0 && isFocusable(i)) || items.find(isFocusable);
    if (!active) return;
    const others = items.filter((i) => i !== active);
    tabs.push({ listRef: refOf(list), activeRef: refOf(active), name: clean(nameOf(list) || itemRole + ' group', 50), rovingOnly: others.every((i) => i.tabIndex < 0), count: items.length });
  });
  const toggles: { ref: string; name: string; role: string }[] = [];
  document.querySelectorAll<HTMLElement>('[aria-expanded]').forEach((el) => {
    if (toggles.length >= max || !isVisible(el) || !isFocusable(el) || el.tabIndex < 0) return;
    if (el.matches('input, select, textarea, a[href]') || ((el as HTMLButtonElement).type === 'submit' && !!(el as HTMLButtonElement).form)) return;
    const name = nameOf(el) || textOf(el, 50);
    if (DESTRUCTIVE.test(name)) return;
    toggles.push({ ref: refOf(el), name: clean(name, 50), role: roleOf(el) });
  });
  return { tabs, toggles };
}

export function focusRef(ref: string): boolean {
  const el = byRef(ref) as HTMLElement | null;
  if (!el) return false;
  el.focus();
  return document.activeElement === el;
}
export function attrOf(ref: string, attr: string): string | null { return byRef(ref)?.getAttribute(attr) ?? null; }
/** Where focus is relative to a container. Example: activeWithin('e7') */
export function activeWithin(ref: string): { ref: string; inside: boolean; role: string; name: string } {
  const box = byRef(ref), a = deepActive();
  if (!a || a === document.body) return { ref: '', inside: false, role: '', name: '' };
  return { ref: refOf(a), inside: !!box && box.contains(a), role: roleOf(a), name: clean(nameOf(a) || textOf(a), 60) };
}
/** Viewport rectangle of an element, optionally scrolling it into view first. */
export function rectOf(ref: string, scroll: boolean): Box | null {
  const el = byRef(ref);
  if (!el) return null;
  if (scroll) bringIntoView(el, false);
  const r = el.getBoundingClientRect();
  if (!r.width && !r.height) return null;
  if (scroll && (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth)) return null;
  return { x: r.left, y: r.top, width: r.width, height: r.height };
}

/**
 * Scrolls the window so the element is on screen.
 * It avoids element.scrollIntoView() where it can: in Chrome that call moves the point the next Tab press
 * starts from, which would corrupt a keyboard traversal. "native" allows it as a last resort.
 */
function bringIntoView(el: Element, native: boolean): void {
  const out = (r: DOMRect) => r.top < 0 || r.bottom > innerHeight || r.left < 0 || r.right > innerWidth;
  let r = el.getBoundingClientRect();
  if (!out(r)) return;
  window.scrollBy(r.left < 0 || r.right > innerWidth ? r.left - innerWidth / 2 + r.width / 2 : 0, r.top - innerHeight / 2 + r.height / 2);
  r = el.getBoundingClientRect();
  if (native && (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth)) el.scrollIntoView({ block: 'center', inline: 'nearest' });
}
export function blurActive(): void { (document.activeElement as HTMLElement | null)?.blur?.(); }
export function evidenceOf(ref: string): ElementEvidence | null { const el = byRef(ref); return el ? evidence(el) : null; }

/** Draws (or removes) a highlight box so a screenshot shows which element an issue is about. */
export function highlight(ref: string | null, native = true): Box | null {
  document.querySelectorAll('[data-a11y-mark]').forEach((m) => m.remove());
  if (!ref) return null;
  const el = byRef(ref);
  if (!el) return null;
  // Centre it, so a sticky header or footer does not sit on top of the element in the screenshot.
  const r0 = el.getBoundingClientRect();
  window.scrollBy(0, r0.top - innerHeight / 2 + r0.height / 2);
  bringIntoView(el, native);
  const r = el.getBoundingClientRect();
  if (!r.width && !r.height) return null;
  if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return null;
  const m = document.createElement('div');
  m.setAttribute('data-a11y-mark', '1');
  m.setAttribute('aria-hidden', 'true');
  const s = m.style;
  s.position = 'fixed'; s.left = r.left - 4 + 'px'; s.top = r.top - 4 + 'px'; s.width = r.width + 8 + 'px'; s.height = r.height + 8 + 'px';
  s.border = '3px solid #e6007e'; s.boxSizing = 'border-box'; s.pointerEvents = 'none'; s.zIndex = '2147483647'; s.borderRadius = '2px';
  document.documentElement.appendChild(m);
  return { x: r.left, y: r.top, width: r.width, height: r.height };
}

export { REF_ATTR };
