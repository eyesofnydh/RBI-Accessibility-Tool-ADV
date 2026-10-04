/** Colour inventory: every colour declared in stylesheets, CSS variables and inline styles, plus how rendered elements use them. */
import type { ColorEntry } from '../types';
import { isVisible, ownText, selectorOf } from './core';
import { COLOR_TOKEN, hex, parseColor } from './color';

const COLOR_PROP = /(color$|^fill$|^stroke$|^background-image$|^box-shadow$|^text-shadow$)/;
const KEYWORDS = /^(inherit|initial|unset|revert|revert-layer|currentcolor|transparent|none|auto)$/i;

function normalise(css: string): string | null {
  const c = parseColor(css);
  if (!c) return null;
  if (c.a === 0) return null;
  return c.a >= 0.995 ? hex(c) : `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${Math.round(c.a * 100) / 100})`;
}

export function colorInventory(): { colors: ColorEntry[]; unreadable: string[] } {
  const map = new Map<string, ColorEntry>();
  const unreadable: string[] = [];
  const rootStyle = getComputedStyle(document.documentElement);
  const add = (raw: string, src: { stylesheet: string; selector: string; property: string; variable: string }): void => {
    const key = normalise(raw);
    if (!key) return;
    let e = map.get(key);
    if (!e) { e = { color: key, raw: [], variables: [], sources: [], occurrences: 0, usedBy: 0, usedAs: [] }; map.set(key, e); }
    e.occurrences++;
    if (e.raw.length < 4 && !e.raw.includes(raw)) e.raw.push(raw);
    if (src.variable && !e.variables.includes(src.variable) && e.variables.length < 8) e.variables.push(src.variable);
    if (e.sources.length < 6 && !e.sources.some((s) => s.selector === src.selector && s.property === src.property)) e.sources.push(src);
  };
  const tokens = (value: string): { raw: string; variable: string }[] => {
    const out: { raw: string; variable: string }[] = [];
    const v = value.trim();
    (v.match(new RegExp(COLOR_TOKEN, 'g')) || []).forEach((raw) => out.push({ raw, variable: '' }));
    (v.match(/var\(\s*(--[\w-]+)/g) || []).forEach((m) => {
      const name = m.replace(/var\(\s*/, '');
      const resolved = rootStyle.getPropertyValue(name).trim();
      if (resolved && CSS.supports('color', resolved)) out.push({ raw: resolved, variable: name });
    });
    if (!out.length && /^[a-z]+$/i.test(v) && !KEYWORDS.test(v) && CSS.supports('color', v)) out.push({ raw: v, variable: '' });
    return out;
  };
  const readStyle = (style: CSSStyleDeclaration, stylesheet: string, selector: string): void => {
    const seen = new Set<string>();
    for (let i = 0; i < style.length; i++) {
      const prop = style[i];
      const value = style.getPropertyValue(prop);
      if (!value) continue;
      if (prop.startsWith('--')) {
        const v = value.trim();
        if (!KEYWORDS.test(v) && !/var\(/.test(v) && CSS.supports('color', v)) add(v, { stylesheet, selector, property: prop, variable: prop });
        continue;
      }
      if (!COLOR_PROP.test(prop)) continue;
      for (const t of tokens(value)) {
        const k = t.raw + '|' + prop.replace(/-(top|right|bottom|left)-/, '-');
        if (seen.has(k)) continue;
        seen.add(k);
        add(t.raw, { stylesheet, selector, property: prop.replace(/-(top|right|bottom|left)-/, '-'), variable: t.variable });
      }
    }
  };
  const readRules = (rules: CSSRuleList, sheet: string): void => {
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSStyleRule) readStyle(rule.style, sheet, rule.selectorText.slice(0, 120));
      const nested = (rule as CSSGroupingRule).cssRules;
      if (nested && !(rule instanceof CSSStyleRule)) readRules(nested, sheet);
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    const label = sheet.href ? sheet.href.split('/').pop()!.split('?')[0] : 'inline <style>';
    try { readRules(sheet.cssRules, label); } catch { if (sheet.href) unreadable.push(sheet.href); }
  }
  document.querySelectorAll<HTMLElement>('[style]').forEach((el) => readStyle(el.style, 'inline style attribute', selectorOf(el)));

  // How rendered elements actually use the colours.
  const use = (css: string, as: string): void => {
    const key = normalise(css);
    if (!key) return;
    let e = map.get(key);
    if (!e) { e = { color: key, raw: [css], variables: [], sources: [], occurrences: 0, usedBy: 0, usedAs: [] }; map.set(key, e); }
    e.usedBy++;
    if (!e.usedAs.includes(as)) e.usedAs.push(as);
  };
  Array.from(document.querySelectorAll('body *')).slice(0, 8000).forEach((el) => {
    if (!isVisible(el)) return;
    const cs = getComputedStyle(el);
    if (el.namespaceURI === 'http://www.w3.org/2000/svg') {
      if (el.localName === 'svg' || el.localName === 'g') return;
      if (cs.fill !== 'none') use(cs.fill, 'SVG fill');
      if (cs.stroke !== 'none' && parseFloat(cs.strokeWidth) > 0) use(cs.stroke, 'SVG stroke');
      return;
    }
    if (ownText(el)) use(cs.color, 'text');
    use(cs.backgroundColor, 'background');
    if (parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== 'none') use(cs.borderTopColor, 'border');
    else if (parseFloat(cs.borderBottomWidth) > 0 && cs.borderBottomStyle !== 'none') use(cs.borderBottomColor, 'border');
  });
  return { colors: Array.from(map.values()), unreadable };
}
