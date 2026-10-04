/**
 * In-page helpers shared by every DOM scanner.
 * This folder is bundled with esbuild and injected into the page as window.__a11y.
 */
import { computeAccessibleDescription, computeAccessibleName } from 'dom-accessibility-api';
import type { Box, Confidence, ElementEvidence, RawFinding, Severity } from '../types';

export const REF_ATTR = 'data-a11y-ref';
let seq = 0;

// ------------------------------------------------------------ findings collector
let findings: RawFinding[] = [];
let passes: Record<string, number> = {};

export interface Extra {
  evidence?: string;
  vars?: Record<string, string | number>;
  severity?: Severity;
  confidence?: Confidence;
  count?: number;
}

export function begin(): void { findings = []; passes = {}; }
export function end<T>(data?: T): { findings: RawFinding[]; passes: Record<string, number>; data: T } {
  const out = { findings, passes, data: data as T };
  findings = []; passes = {};
  return out;
}
/** Records a failure. Example: fail('tables.no-headers', table, 'Table has 12 cells and no <th>.') */
export function fail(rule: string, el: Element | null, actual: string, extra: Extra = {}): void {
  findings.push({ rule, status: false, el: el ? evidence(el) : undefined, actual, ...extra });
}
/** Records an item the tester must check by hand (status null). */
export function review(rule: string, el: Element | null, actual: string, extra: Extra = {}): void {
  findings.push({ rule, status: null, el: el ? evidence(el) : undefined, actual, ...extra });
}
/** Counts passed checks for a rule. */
export function pass(rule: string, n = 1): void { if (n > 0) passes[rule] = (passes[rule] || 0) + n; }

// ------------------------------------------------------------ element references
/** Tags the element so the Node side can find it again. Example: refOf(el) -> "e12" */
export function refOf(el: Element): string {
  let r = el.getAttribute(REF_ATTR);
  if (!r) { r = 'e' + (++seq); el.setAttribute(REF_ATTR, r); }
  return r;
}
export function byRef(ref: string): Element | null { return document.querySelector(`[${REF_ATTR}="${ref}"]`); }

export function parentOf(n: Element): Element | null {
  if (n.assignedSlot) return n.assignedSlot;
  if (n.parentElement) return n.parentElement;
  const root = n.getRootNode();
  return root instanceof ShadowRoot ? root.host : null;
}

/** A unique CSS selector. Example: "#main-content > div:nth-of-type(2) > a.card__link" */
export function selectorOf(el: Element): string {
  const parts: string[] = [];
  let n: Element | null = el;
  while (n && n.nodeType === 1 && n !== document.documentElement) {
    const id = n.getAttribute('id');
    if (id && /^[A-Za-z][\w-]*$/.test(id) && document.querySelectorAll('#' + CSS.escape(id)).length === 1) {
      parts.unshift('#' + CSS.escape(id));
      return parts.join(' > ');
    }
    let s = n.localName;
    const cls = (n.getAttribute('class') || '').trim().split(/\s+/).filter((c) => c && /^[A-Za-z_][\w-]*$/.test(c) && !/^(ng-|_ng|cdk-|is-|has-)/.test(c));
    if (cls.length) s += '.' + cls[0];
    const p: Element | null = n.parentElement;
    if (p) {
      const same = Array.from(p.children).filter((c) => c.localName === n!.localName);
      if (same.length > 1) s += `:nth-of-type(${same.indexOf(n) + 1})`;
    }
    parts.unshift(s);
    n = p;
  }
  if (n === document.documentElement) parts.unshift('html');
  return parts.join(' > ');
}

/** XPath to the element. Example: //*[@id="main-content"]/div[2]/a[1] */
export function xpathOf(el: Element): string {
  const parts: string[] = [];
  let n: Element | null = el;
  while (n && n.nodeType === 1) {
    const id = n.getAttribute('id');
    if (id && !/["']/.test(id) && document.querySelectorAll('#' + CSS.escape(id)).length === 1) {
      return `//*[@id="${id}"]` + (parts.length ? '/' + parts.join('/') : '');
    }
    const p: Element | null = n.parentElement;
    const same = p ? Array.from(p.children).filter((c) => c.localName === n!.localName) : [n];
    parts.unshift(n.localName + (same.length > 1 ? `[${same.indexOf(n) + 1}]` : ''));
    n = p;
  }
  return '/' + parts.join('/');
}

// ------------------------------------------------------------ text
export function clean(t: string | null | undefined, max = 120): string {
  const s = String(t || '').replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max - 1) + '\u2026' : s;
}
/** Text typed directly inside this element (not in children). */
export function ownText(el: Element): string {
  let t = '';
  for (let c = el.firstChild; c; c = c.nextSibling) if (c.nodeType === 3) t += c.nodeValue;
  return t.replace(/\s+/g, ' ').trim();
}
export function textOf(el: Element, max = 120): string {
  const t = el instanceof HTMLElement ? el.innerText : el.textContent;
  return clean(t || el.textContent, max);
}

// ------------------------------------------------------------ visibility
/** In the render tree (not display:none / visibility:hidden / hidden). */
export function isRendered(el: Element): boolean {
  if (typeof el.checkVisibility === 'function') {
    return el.checkVisibility({ checkVisibilityCSS: true, visibilityProperty: true, contentVisibilityAuto: true } as CheckVisibilityOptions);
  }
  const cs = getComputedStyle(el);
  return cs.display !== 'none' && cs.visibility === 'visible' && el.getClientRects().length > 0;
}

const clipCache = new WeakMap<Element, boolean>();
/** True for "screen-reader only" tricks: clipped to nothing or squeezed to 1px. */
export function isClippedAway(el: Element): boolean {
  for (let n: Element | null = el; n && n !== document.documentElement; n = parentOf(n)) {
    let hit = clipCache.get(n);
    if (hit === undefined) {
      const cs = getComputedStyle(n);
      hit = false;
      const cm = /rect\(([^)]*)\)/.exec(cs.clip || '');
      if (cm && (cs.position === 'absolute' || cs.position === 'fixed')) {
        const v = cm[1].split(/[\s,]+/).map(parseFloat);
        if (v.length === 4 && (v[1] - v[3] <= 0 || v[2] - v[0] <= 0)) hit = true;
      }
      if (!hit && /inset\(\s*(50|100)%/.test(cs.clipPath || '')) hit = true;
      if (!hit && (cs.overflowX !== 'visible' || cs.overflowY !== 'visible')) {
        const r = n.getBoundingClientRect();
        if (r.width <= 1.5 || r.height <= 1.5) hit = true;
      }
      clipCache.set(n, hit);
    }
    if (hit) return true;
  }
  return false;
}

export function opacityOf(el: Element): number {
  let o = 1;
  for (let n: Element | null = el; n; n = parentOf(n)) {
    const v = parseFloat(getComputedStyle(n).opacity);
    if (!isNaN(v)) o *= v;
  }
  return o;
}

/** Can a sighted user see it? Rendered, has size, not transparent, not clipped away. */
export function isVisible(el: Element): boolean {
  if (!isRendered(el)) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return false;
  if (r.right + window.scrollX < 0 || r.bottom + window.scrollY < 0) return false;
  if (isClippedAway(el)) return false;
  return opacityOf(el) > 0.05;
}

/** Hidden from assistive technology (aria-hidden, inert, or not rendered). */
export function isAriaHidden(el: Element): boolean {
  return !isRendered(el) || !!el.closest('[aria-hidden="true"], [inert]');
}

export function boxOf(el: Element): Box | null {
  const r = el.getBoundingClientRect();
  if (!r.width && !r.height) return null;
  return { x: Math.round(r.left + window.scrollX), y: Math.round(r.top + window.scrollY), width: Math.round(r.width), height: Math.round(r.height) };
}

// ------------------------------------------------------------ roles, names, focus
const INPUT_ROLES: Record<string, string> = {
  button: 'button', submit: 'button', reset: 'button', image: 'button', checkbox: 'checkbox', radio: 'radio',
  range: 'slider', number: 'spinbutton', search: 'searchbox', email: 'textbox', tel: 'textbox', text: 'textbox',
  url: 'textbox', password: 'textbox',
};
const TAG_ROLES: Record<string, string> = {
  button: 'button', select: 'combobox', textarea: 'textbox', nav: 'navigation', main: 'main', aside: 'complementary',
  h1: 'heading', h2: 'heading', h3: 'heading', h4: 'heading', h5: 'heading', h6: 'heading', ul: 'list', ol: 'list',
  li: 'listitem', table: 'table', tr: 'row', td: 'cell', th: 'columnheader', dialog: 'dialog', summary: 'button',
  details: 'group', fieldset: 'group', article: 'article', figure: 'figure', progress: 'progressbar', option: 'option',
  hr: 'separator', output: 'status', form: 'form', search: 'search',
};
/** The role assistive technology sees. Example: roleOf(<a href>) -> "link" */
export function roleOf(el: Element): string {
  const explicit = (el.getAttribute('role') || '').trim().split(/\s+/)[0];
  if (explicit) return explicit;
  const tag = el.localName;
  if (tag === 'a' || tag === 'area') return el.hasAttribute('href') ? 'link' : 'generic';
  if (tag === 'input') return INPUT_ROLES[(el.getAttribute('type') || 'text').toLowerCase()] || 'textbox';
  if (tag === 'img') return el.getAttribute('alt') === '' ? 'presentation' : 'img';
  if (tag === 'header') return el.closest('article, aside, main, nav, section') ? 'generic' : 'banner';
  if (tag === 'footer') return el.closest('article, aside, main, nav, section') ? 'generic' : 'contentinfo';
  if (tag === 'section') return el.hasAttribute('aria-label') || el.hasAttribute('aria-labelledby') ? 'region' : 'generic';
  if (tag === 'svg') return 'graphics-document';
  return TAG_ROLES[tag] || 'generic';
}

/** Accessible name, computed by the accname algorithm (dom-accessibility-api). */
export function nameOf(el: Element): string {
  try { return clean(computeAccessibleName(el), 200); } catch { return ''; }
}
export function descriptionOf(el: Element): string {
  try { return clean(computeAccessibleDescription(el), 200); } catch { return ''; }
}

const NATIVE_FOCUS = 'a[href], area[href], button, input, select, textarea, summary, iframe, audio[controls], video[controls], [contenteditable=""], [contenteditable="true"]';
export const FOCUS_SELECTOR = NATIVE_FOCUS + ', [tabindex]';

export function isDisabled(el: Element): boolean {
  return (el as HTMLButtonElement).disabled === true || !!el.closest('fieldset[disabled]');
}
export function isNativeInteractive(el: Element): boolean {
  if (!el.matches(NATIVE_FOCUS)) return false;
  return !(el.localName === 'input' && (el.getAttribute('type') || '').toLowerCase() === 'hidden');
}
/** Can it take focus at all (including tabindex="-1")? */
export function isFocusable(el: Element): boolean {
  if (isDisabled(el) || el.closest('[inert]')) return false;
  if (el.hasAttribute('tabindex')) return !isNaN(parseInt(el.getAttribute('tabindex') || '', 10));
  return isNativeInteractive(el);
}
/** Is it a stop in the Tab sequence? */
export function isTabbable(el: Element): boolean {
  if (!isFocusable(el) || (el as HTMLElement).tabIndex < 0 || !isRendered(el)) return false;
  if (el.localName === 'input' && (el as HTMLInputElement).type === 'radio') {
    const r = el as HTMLInputElement;
    if (r.name && !r.checked) {
      const group = Array.from(document.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${CSS.escape(r.name)}"]`)).filter((x) => x.form === r.form);
      const checked = group.find((x) => x.checked);
      if (checked ? checked !== r : group[0] !== r) return false;
    }
  }
  const d = el.closest('details:not([open])');
  if (d && !(el.localName === 'summary' && el.parentElement === d)) return false;
  return true;
}
/** Every Tab stop, in tab order. */
export function tabbables(root: ParentNode = document): HTMLElement[] {
  const all = Array.from(root.querySelectorAll<HTMLElement>(FOCUS_SELECTOR)).filter(isTabbable);
  const positive = all.filter((e) => e.tabIndex > 0).sort((a, b) => a.tabIndex - b.tabIndex);
  return positive.concat(all.filter((e) => e.tabIndex === 0));
}

// ------------------------------------------------------------ evidence
/** Label of the page area the element sits in. Example: "navigation: Main / Notifications" */
export function sectionOf(el: Element): string {
  const out: string[] = [];
  const lm = el.closest('nav, main, header, footer, aside, form, section[aria-label], section[aria-labelledby], [role="navigation"], [role="main"], [role="banner"], [role="contentinfo"], [role="region"], [role="dialog"], [role="search"]');
  if (lm) {
    const label = lm.getAttribute('aria-label') || '';
    out.push(roleOf(lm) === 'generic' ? lm.localName : roleOf(lm) + (label ? ': ' + clean(label, 40) : ''));
  }
  for (let a: Element | null = el.parentElement, depth = 0; a && depth < 8; a = a.parentElement, depth++) {
    const hs = a.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"]');
    let found: Element | null = null;
    for (let i = hs.length - 1; i >= 0; i--) {
      if (hs[i] !== el && !hs[i].contains(el) && (hs[i].compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)) { found = hs[i]; break; }
    }
    if (found) { out.push(clean(found.textContent, 60)); break; }
  }
  return out.join(' / ');
}

const STYLE_PROPS = ['color', 'background-color', 'font-size', 'font-weight', 'display', 'position', 'opacity', 'outline', 'border', 'text-decoration-line', 'overflow'];

/** Everything recorded about an element for a bug report (requirement section 40). */
export function evidence(el: Element): ElementEvidence {
  const cs = getComputedStyle(el);
  const computedStyle: Record<string, string> = {};
  STYLE_PROPS.forEach((p) => { computedStyle[p] = cs.getPropertyValue(p); });
  const html = el.outerHTML.replace(new RegExp(`\\s${REF_ATTR}="[^"]*"`, 'g'), '');
  return {
    ref: refOf(el),
    selector: selectorOf(el),
    xpath: xpathOf(el),
    tag: el.localName,
    role: roleOf(el),
    name: nameOf(el),
    text: textOf(el),
    html: html.length > 400 ? html.slice(0, 400) + '\u2026' : html,
    computedStyle,
    boundingBox: boxOf(el),
    section: sectionOf(el),
  };
}
