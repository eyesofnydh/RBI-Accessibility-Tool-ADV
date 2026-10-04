/** Colour maths and "what colour is painted behind this element" logic. */
import { parentOf } from './core';

export interface RGBA { r: number; g: number; b: number; a: number }

export const WHITE: RGBA = { r: 255, g: 255, b: 255, a: 1 };
const CLEAR: RGBA = { r: 0, g: 0, b: 0, a: 0 };
export const COLOR_TOKEN = '(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\\([^()]*\\)|#[0-9a-fA-F]{3,8}\\b';

let ctx: CanvasRenderingContext2D | null | undefined;
const cache = new Map<string, RGBA | null>();

/** Turns any CSS colour string into {r,g,b,a}. Example: parseColor('rgb(0, 0, 0)') */
export function parseColor(input: string | null | undefined): RGBA | null {
  if (!input) return null;
  const str = String(input).trim();
  if (cache.has(str)) return cache.get(str)!;
  let c: RGBA | null = null;
  const m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(str);
  if (m) {
    const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    c = { r: +m[1], g: +m[2], b: +m[3], a };
  } else if (str === 'transparent') {
    c = CLEAR;
  } else {
    // Any other format (oklch, color(srgb ...), hsl, hex): let the browser paint one pixel.
    if (ctx === undefined) {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 1;
      ctx = cv.getContext('2d', { willReadFrequently: true });
    }
    if (ctx) {
      ctx.fillStyle = '#010203';
      ctx.fillStyle = str;
      if (ctx.fillStyle !== '#010203' || /^#?010203$/.test(str)) {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillRect(0, 0, 1, 1);
        const d = ctx.getImageData(0, 0, 1, 1).data;
        c = { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
      }
    }
  }
  cache.set(str, c);
  return c;
}

/** Paints a see-through colour on top of a solid one. */
export function over(top: RGBA, bottom: RGBA): RGBA {
  const a = top.a;
  return { r: top.r * a + bottom.r * (1 - a), g: top.g * a + bottom.g * (1 - a), b: top.b * a + bottom.b * (1 - a), a: 1 };
}
/** Fades colour x towards base (CSS opacity). */
export function mix(base: RGBA, x: RGBA, op: number): RGBA {
  return { r: base.r * (1 - op) + x.r * op, g: base.g * (1 - op) + x.g * op, b: base.b * (1 - op) + x.b * op, a: 1 };
}
export function rnd(c: RGBA): RGBA {
  const f = (v: number) => Math.round(Math.max(0, Math.min(255, v)));
  return { r: f(c.r), g: f(c.g), b: f(c.b), a: 1 };
}
export function hex(c: RGBA): string {
  const h = (v: number) => v.toString(16).padStart(2, '0');
  const x = rnd(c);
  return ('#' + h(x.r) + h(x.g) + h(x.b)).toUpperCase();
}
export function rgbText(c: RGBA): string { const x = rnd(c); return `rgb(${x.r}, ${x.g}, ${x.b})`; }

/** WCAG relative luminance. */
export function luminance(c: RGBA): number {
  const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
}
/** WCAG contrast ratio between two solid colours (1 to 21). */
export function ratio(a: RGBA, b: RGBA): number {
  const l1 = luminance(a), l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
/** Cuts, never rounds up, to 2 decimals: 4.499 becomes 4.49, so a fail is never shown as a pass. */
export function floor2(r: number): number { return Math.floor(r * 100) / 100; }

interface StyleInfo { cs: CSSStyleDeclaration; bg: RGBA; kind: 'none' | 'url' | 'icon' | 'gradient'; stops: RGBA[]; opacity: number }
let infoCache = new WeakMap<Element, StyleInfo>();
export function resetStyleCache(): void { infoCache = new WeakMap(); }

/** Computed style facts for one element, read once and remembered. */
export function info(el: Element): StyleInfo {
  let i = infoCache.get(el);
  if (i) return i;
  const cs = getComputedStyle(el);
  const img = cs.backgroundImage;
  let kind: StyleInfo['kind'] = 'none';
  let stops: RGBA[] = [];
  if (img && img !== 'none') {
    if (/url\(/i.test(img)) {
      // A no-repeat image with no cover/contain size is almost always a small icon.
      const fills = /cover|contain|100%/.test(cs.backgroundSize) || /(^|[\s,])(repeat|repeat-x|repeat-y|round|space)/.test(cs.backgroundRepeat);
      kind = fills ? 'url' : 'icon';
    } else if (/gradient\(/i.test(img)) {
      stops = (img.match(new RegExp(COLOR_TOKEN, 'g')) || []).map(parseColor).filter((c): c is RGBA => !!c).slice(0, 8);
      kind = stops.length ? 'gradient' : 'url';
    }
  }
  const op = parseFloat(cs.opacity);
  i = { cs, bg: parseColor(cs.backgroundColor) || CLEAR, kind, stops, opacity: isNaN(op) ? 1 : op };
  infoCache.set(el, i);
  return i;
}

export interface Backdrop {
  /** Possible solid colours behind the element (more than one only for gradients). */
  cands: RGBA[];
  /** A photo or background image sits behind it, so it cannot be measured. */
  image: boolean;
  gradient: boolean;
  icon: boolean;
  groups: { base: RGBA; op: number }[];
  /** The element that supplied the last solid background. */
  owner: Element | null;
  /** The CSS background-color value of that owner, as written in computed style. */
  css: string;
}

/** Walks from the page root down to the element, stacking every background on the way. */
export function backdrop(el: Element, includeSelf: boolean): Backdrop {
  const chain: Element[] = [];
  for (let n: Element | null = includeSelf ? el : parentOf(el); n; n = parentOf(n)) chain.push(n);
  let cands: RGBA[] = [WHITE];
  let image = false, gradient = false, icon = false, owner: Element | null = null, css = 'rgb(255, 255, 255)';
  const groups: Backdrop['groups'] = [];
  for (let k = chain.length - 1; k >= 0; k--) {
    const a = chain[k], i = info(a);
    if (i.opacity < 1) groups.push({ base: cands[0], op: i.opacity });
    if (i.bg.a > 0) {
      if (i.bg.a >= 0.995) {
        cands = [{ r: i.bg.r, g: i.bg.g, b: i.bg.b, a: 1 }];
        image = false; gradient = false; icon = false; owner = a;
      } else {
        cands = cands.map((c) => over(i.bg, c));
      }
      css = i.cs.backgroundColor;
    }
    if (i.kind === 'url') image = true;
    else if (i.kind === 'icon') icon = true;
    else if (i.kind === 'gradient') {
      const next: RGBA[] = [], seen = new Set<string>();
      for (const s of i.stops) for (const c of cands) {
        const o = over(s, c), key = hex(o);
        if (!seen.has(key)) { seen.add(key); next.push(o); }
      }
      cands = next.slice(0, 12);
      gradient = cands.length > 1;
      css = i.cs.backgroundImage;
      if (i.stops.every((s) => s.a >= 0.995)) { image = false; owner = a; }
    }
  }
  return { cands, image, gradient, icon, groups, owner, css };
}

export interface Pair { fg: RGBA | null; bg: RGBA; ratio: number }
/** Final on-screen colours (after opacity) of a foreground on each possible background. */
export function finalPairs(bd: Backdrop, fg: RGBA | null): Pair[] {
  return bd.cands.map((c) => {
    let b = c, f = fg ? over(fg, c) : null;
    for (let g = bd.groups.length - 1; g >= 0; g--) {
      b = mix(bd.groups[g].base, b, bd.groups[g].op);
      if (f) f = mix(bd.groups[g].base, f, bd.groups[g].op);
    }
    b = rnd(b);
    f = f ? rnd(f) : null;
    return { fg: f, bg: b, ratio: f ? ratio(f, b) : 0 };
  });
}
export function worstOf(pairs: Pair[], required: number): { worst: Pair; all: boolean; none: boolean } {
  let worst = pairs[0], passes = 0;
  for (const p of pairs) { if (p.ratio >= required) passes++; if (p.ratio < worst.ratio) worst = p; }
  return { worst, all: passes === pairs.length, none: passes === 0 };
}
/** Solid colour behind an element (first candidate). */
export function solidBehind(el: Element, includeSelf: boolean): { color: RGBA; bd: Backdrop } {
  const bd = backdrop(el, includeSelf);
  return { color: finalPairs(bd, null)[0].bg, bd };
}
