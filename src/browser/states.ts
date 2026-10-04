/** Helpers for tests that change the page state: opening content, forcing hover and focus, tooltips, form errors, pagination. */
import { FOCUS_SELECTOR, byRef, clean, isAriaHidden, isFocusable, isVisible, nameOf, ownText, pass, refOf, review, selectorOf, tabbables, textOf } from './core';
import { backdrop, finalPairs, floor2, hex, parseColor, resetStyleCache, worstOf } from './color';

const DESTRUCTIVE = /(delete|remove|submit|log ?out|sign ?out|pay|send|download|print|reset|unsubscribe|share|export)/i;

// ------------------------------------------------------------------ content that can be opened
export interface OpenTarget { ref: string; selector: string; name: string; kind: 'toggle' | 'tab' | 'details' }

/** Closed menus, accordions, dropdowns, <details> and unselected tabs that are safe to open. */
export function openTargets(maxPerTablist: number): OpenTarget[] {
  const out: OpenTarget[] = [];
  const add = (el: Element, kind: OpenTarget['kind']) => {
    const name = clean(nameOf(el) || textOf(el, 60), 60);
    if (DESTRUCTIVE.test(name)) return;
    out.push({ ref: refOf(el), selector: selectorOf(el), name: name || kind, kind });
  };
  document.querySelectorAll<HTMLElement>('[aria-expanded="false"]').forEach((el) => {
    if (!isVisible(el) || isAriaHidden(el) || !isFocusable(el)) return;
    if (el.matches('input, select, textarea') || el.closest('[aria-disabled="true"], [disabled]')) return;
    if (el.localName === 'a' && /^https?:/.test(el.getAttribute('href') || '') ) return; // a real link navigates
    if ((el as HTMLButtonElement).type === 'submit' && (el as HTMLButtonElement).form) return;
    add(el, 'toggle');
  });
  document.querySelectorAll('details:not([open]) > summary').forEach((el) => { if (isVisible(el)) add(el, 'details'); });
  document.querySelectorAll('[role="tablist"]').forEach((list) => {
    if (!isVisible(list)) return;
    Array.from(list.querySelectorAll('[role="tab"]')).filter((t) => t.getAttribute('aria-selected') !== 'true' && isVisible(t) && !t.closest('[aria-disabled="true"], [disabled]'))
      .slice(0, maxPerTablist).forEach((t) => add(t, 'tab'));
  });
  return out;
}

/** Is the target open now? */
export function isOpen(ref: string): boolean {
  const el = byRef(ref);
  if (!el) return false;
  if (el.localName === 'summary') return !!(el.parentElement as HTMLDetailsElement | null)?.open;
  return el.getAttribute('aria-expanded') === 'true' || el.getAttribute('aria-selected') === 'true';
}

// ------------------------------------------------------------------ hover and focus colours
/** Links, buttons and tabs with visible text. At most three of each look (same tag, class and colours) are returned. */
export function stateTargets(max: number): { ref: string; name: string }[] {
  const seen = new Map<string, number>();
  const out: { ref: string; name: string }[] = [];
  document.querySelectorAll('a[href], button, summary, [role="button"], [role="tab"], [role="link"], [role="menuitem"]').forEach((el) => {
    if (out.length >= max || !isVisible(el) || !textOf(el, 5) || el.closest('[disabled], [aria-disabled="true"]')) return;
    const cs = getComputedStyle(el);
    const key = [el.localName, el.getAttribute('class') || '', cs.color, cs.backgroundColor].join('|');
    const n = seen.get(key) || 0;
    if (n >= 3) return;
    seen.set(key, n + 1);
    out.push({ ref: refOf(el), name: clean(nameOf(el) || textOf(el), 60) });
  });
  return out;
}

export interface QuickText { selector: string; ref: string; text: string; fgCss: string; bgCss: string; fg: string; bg: string; ratio: number | null; required: number; status: boolean | null; size: string; weight: string; large: boolean; note: string }

/** Text contrast of one control as it looks right now (used while hover or focus is forced on it). */
export function quickText(ref: string): QuickText[] {
  const root = byRef(ref);
  if (!root) return [];
  resetStyleCache();
  const els = [root].concat(Array.from(root.querySelectorAll('*'))).filter((e) => ownText(e).length > 0 && isVisible(e)).slice(0, 4);
  return els.map((el) => {
    const cs = getComputedStyle(el);
    const fgCss = cs.webkitTextFillColor || cs.color;
    const fg = parseColor(fgCss) || parseColor(cs.color);
    const size = parseFloat(cs.fontSize) || 0, weight = parseInt(cs.fontWeight, 10) || 400;
    const large = size >= 24 || (size >= 18.6 && weight >= 700);
    const required = large ? 3 : 4.5;
    const bd = backdrop(el, true);
    const base = { selector: selectorOf(el), ref: refOf(el), text: clean(ownText(el), 80), fgCss, bgCss: bd.css, required, size: Math.round(size * 100) / 100 + 'px', weight: String(weight), large };
    if (!fg || fg.a === 0) return { ...base, fg: '', bg: '', ratio: null, status: null, note: 'Text colour is transparent' };
    const w = worstOf(finalPairs(bd, fg), required);
    if (bd.image) return { ...base, fg: hex(w.worst.fg!), bg: 'image', ratio: null, status: null, note: 'Background is an image' };
    const mixed = bd.gradient && !w.all && !w.none;
    return { ...base, fg: hex(w.worst.fg!), bg: hex(w.worst.bg), ratio: floor2(w.worst.ratio), status: mixed ? null : w.all, note: mixed ? 'Gradient: passes on some colour stops only' : '' };
  });
}

// ------------------------------------------------------------------ tooltips (content on hover or focus)
export function tooltipTargets(max: number): { triggerRef: string; tipRef: string; name: string }[] {
  const out: { triggerRef: string; tipRef: string; name: string }[] = [];
  const tips = Array.from(document.querySelectorAll('[role="tooltip"], [class*="tooltip" i]:not([role="tooltip"])'));
  for (const tip of tips) {
    if (out.length >= max) break;
    if (isVisible(tip) || !clean(tip.textContent)) continue; // only content that is hidden until hover or focus
    if (tips.some((t) => t !== tip && t.contains(tip))) continue;
    let trigger: Element | null = tip.id ? document.querySelector(`[aria-describedby~="${CSS.escape(tip.id)}"], [aria-labelledby~="${CSS.escape(tip.id)}"], [aria-controls~="${CSS.escape(tip.id)}"]`) : null;
    if (!trigger) {
      const near = [tip.previousElementSibling, tip.parentElement].filter((e): e is Element => !!e);
      trigger = near.find((e) => isVisible(e) && (e.matches(FOCUS_SELECTOR) || !!e.querySelector(FOCUS_SELECTOR))) || null;
      if (trigger && !trigger.matches(FOCUS_SELECTOR)) trigger = Array.from(trigger.querySelectorAll(FOCUS_SELECTOR)).find(isVisible) || trigger;
    }
    if (!trigger || !isVisible(trigger) || trigger.contains(tip) && trigger === document.body) continue;
    out.push({ triggerRef: refOf(trigger), tipRef: refOf(tip), name: clean(nameOf(trigger) || textOf(trigger), 50) });
  }
  return out;
}
export function visibleNow(ref: string): boolean { const el = byRef(ref); return !!el && isVisible(el); }
export function centreOf(ref: string): { x: number; y: number } | null {
  const el = byRef(ref);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width && r.height ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
}

// ------------------------------------------------------------------ form errors
const ERROR_SEL = '[role="alert"], [aria-live]:not([aria-live="off"]), [class*="error" i], [class*="invalid" i], [class*="danger" i], [class*="validation" i]';

/** Forms worth an empty-submit test: at least one required or typed field and a submit control. Search forms are left to the search test. */
export function formTargets(max: number): { formRef: string; submitRef: string; name: string; fields: number; native: boolean }[] {
  const out: { formRef: string; submitRef: string; name: string; fields: number; native: boolean }[] = [];
  document.querySelectorAll('form').forEach((form) => {
    if (out.length >= max || !isVisible(form) || form.getAttribute('role') === 'search' || form.closest('[role="search"]')) return;
    const fields = Array.from(form.querySelectorAll<HTMLInputElement>('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea')).filter(isVisible);
    const needs = fields.filter((f) => f.required || f.getAttribute('aria-required') === 'true' || ['email', 'url', 'tel', 'number'].includes(f.type));
    if (!needs.length || (fields.length === 1 && fields[0].type === 'search')) return;
    const submit = Array.from(form.querySelectorAll<HTMLElement>('button:not([type="button"]):not([type="reset"]), input[type="submit"]')).find(isVisible);
    if (!submit) return;
    out.push({ formRef: refOf(form), submitRef: refOf(submit), name: clean(nameOf(form) || nameOf(submit) || 'form', 50), fields: fields.length, native: !form.noValidate && fields.some((f) => f.required) });
  });
  return out;
}

/** Text of every error-looking element that is visible inside (or right after) the form. */
function errorTexts(form: Element): Element[] {
  const scope = [form, form.nextElementSibling, form.parentElement].filter((e): e is Element => !!e);
  const found = new Set<Element>();
  scope.forEach((s) => s.querySelectorAll(ERROR_SEL).forEach((e) => { if (isVisible(e) && clean(ownText(e) || e.textContent).length > 2 && !e.matches('input, select, textarea, form, label')) found.add(e); }));
  return Array.from(found).filter((e) => !Array.from(found).some((o) => o !== e && e.contains(o)));
}
export function formErrorBaseline(formRef: string): string[] {
  const form = byRef(formRef);
  return form ? errorTexts(form).map((e) => clean(e.textContent, 80)) : [];
}
export function formErrorState(formRef: string, before: string[]): { nativeInvalid: number; ariaInvalid: number; unlinked: string[]; errors: { text: string; exposed: boolean; ref: string }[]; focusOnField: boolean; liveUpdated: boolean } {
  const form = byRef(formRef) as HTMLFormElement | null;
  if (!form) return { nativeInvalid: 0, ariaInvalid: 0, unlinked: [], errors: [], focusOnField: false, liveUpdated: false };
  const fields = Array.from(form.querySelectorAll<HTMLInputElement>('input:not([type="hidden"]), select, textarea')).filter(isVisible);
  const described = new Set<string>();
  fields.forEach((f) => ((f.getAttribute('aria-describedby') || '') + ' ' + (f.getAttribute('aria-errormessage') || '')).split(/\s+/).forEach((id) => id && described.add(id)));
  const errs = errorTexts(form).filter((e) => !before.includes(clean(e.textContent, 80)));
  const errors = errs.map((e) => {
    const inLive = !!e.closest('[role="alert"], [aria-live]:not([aria-live="off"]), [role="status"]');
    const linked = [e, ...Array.from(e.querySelectorAll('[id]'))].some((x) => x.id && described.has(x.id)) || !!(e.closest('[id]') && described.has(e.closest('[id]')!.id));
    return { text: clean(e.textContent, 80), exposed: inLive || linked, ref: refOf(e) };
  });
  const invalid = fields.filter((f) => f.getAttribute('aria-invalid') === 'true');
  const active = document.activeElement;
  return {
    nativeInvalid: form.noValidate ? 0 : fields.filter((f) => f.willValidate && !f.checkValidity()).length,
    ariaInvalid: invalid.length,
    unlinked: invalid.filter((f) => !((f.getAttribute('aria-describedby') || '') + (f.getAttribute('aria-errormessage') || '')).trim()).map((f) => clean(nameOf(f) || f.name, 40)),
    errors,
    focusOnField: !!active && fields.includes(active as HTMLInputElement) && (active.getAttribute('aria-invalid') === 'true' || !(active as HTMLInputElement).checkValidity?.()),
    liveUpdated: errors.some((e) => e.exposed),
  };
}

// ------------------------------------------------------------------ pagination
export function paginationTarget(): { navRef: string; nextRef: string; current: string; labelled: boolean; hasCurrent: boolean } | null {
  const navs = Array.from(document.querySelectorAll('nav[aria-label*="pagination" i], [role="navigation"][aria-label*="pagination" i], [class*="pagination" i], [class*="pager" i]')).filter(isVisible);
  for (const nav of navs.filter((n) => !navs.some((o) => o !== n && o.contains(n)))) {
    const controls = Array.from(nav.querySelectorAll<HTMLElement>('a[href], button, [role="button"]')).filter(isVisible);
    const next = controls.find((c) => /next/i.test(nameOf(c) + ' ' + (c.getAttribute('class') || '') + ' ' + (c.getAttribute('rel') || '')) || /^[\u203A\u00BB>]+$/.test(clean(c.textContent)));
    if (!next || next.closest('[disabled], [aria-disabled="true"]') || (next as HTMLButtonElement).disabled) continue;
    const cur = nav.querySelector('[aria-current]');
    const landmark = nav.closest('nav, [role="navigation"]') || nav.querySelector('nav, [role="navigation"]');
    return { navRef: refOf(nav), nextRef: refOf(next), current: clean(cur?.textContent, 20), labelled: !!landmark && !!nameOf(landmark), hasCurrent: !!cur };
  }
  return null;
}
export function paginationCurrent(navRef: string): string { return clean(byRef(navRef)?.querySelector('[aria-current]')?.textContent, 20); }

// ------------------------------------------------------------------ media
export function scanMedia(): number {
  let n = 0;
  document.querySelectorAll<HTMLMediaElement>('video, audio').forEach((m) => {
    if (m.localName === 'video' && !isVisible(m)) return;
    n++;
    const captions = !!m.querySelector('track[kind="captions"], track[kind="subtitles"]');
    if (m.localName === 'video' && !captions) review('media.captions', m, 'The <video> has no <track kind="captions"> or subtitles track.');
    else pass('media.captions');
    if (m.autoplay && !m.muted) review('media.autoplay', m, `The <${m.localName}> starts playing by itself with sound on.`);
  });
  return n;
}

/** Elements whose opacity is being animated right now (a cross-fade). Contrast measured mid-fade is not reliable. */
export function fadingElements(): Element[] {
  if (typeof document.getAnimations !== 'function') return [];
  const out: Element[] = [];
  for (const a of document.getAnimations()) {
    if (a.playState !== 'running') continue;
    const effect = a.effect as KeyframeEffect | null;
    const target = effect?.target;
    if (!target) continue;
    try { if (effect.getKeyframes().some((k) => 'opacity' in k)) out.push(target); } catch { /* ignore */ }
  }
  return out;
}

export { tabbables };
