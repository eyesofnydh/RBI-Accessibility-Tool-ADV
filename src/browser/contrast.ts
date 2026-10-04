/**
 * Colour contrast scanner (WCAG 1.4.3, 1.4.11, 1.4.1).
 * Colours come from computed CSS, never from screenshots.
 */
import type { ContrastRow } from '../types';
import { clean, fail, isClippedAway, isDisabled, isRendered, isVisible, nameOf, pass, refOf, review, selectorOf, textOf, REF_ATTR } from './core';
import { fadingElements } from './states';
import { Backdrop, COLOR_TOKEN, RGBA, backdrop, finalPairs, floor2, hex, info, over, parseColor, ratio, resetStyleCache, rgbText, rnd, solidBehind, worstOf } from './color';

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'IFRAME', 'OBJECT', 'HEAD', 'TITLE', 'DESC', 'OPTION', 'OPTGROUP', 'SELECT', 'TEXTAREA']);
const NO_BOX = new Set(['hidden', 'checkbox', 'radio', 'range', 'color', 'file', 'image']);
const BUTTONS = new Set(['submit', 'button', 'reset']);
const SVG_NS = 'http://www.w3.org/2000/svg';

export function scanContrast(opts: { borders?: boolean } = {}): ContrastRow[] {
  const borders = opts.borders !== false;
  resetStyleCache();
  const rows: ContrastRow[] = [];
  const fading = fadingElements(); // elements in the middle of a cross-fade

  // Photos and videos, to spot text sitting on top of them.
  const media: { el: Element; r: DOMRect }[] = [];
  document.querySelectorAll('img, video, canvas').forEach((m) => {
    const r = m.getBoundingClientRect();
    if (r.width * r.height >= 1600 && isVisible(m)) media.push({ el: m, r });
  });
  const overImage = (el: Element, rect: DOMRect, bd: Backdrop): boolean => {
    const area = rect.width * rect.height;
    if (!area) return false;
    return media.some((m) => {
      if (bd.owner && !bd.owner.contains(m.el)) return false; // image is under a solid background
      if (m.el === el || el.contains(m.el)) return false;
      const w = Math.min(rect.right, m.r.right) - Math.max(rect.left, m.r.left);
      const h = Math.min(rect.bottom, m.r.bottom) - Math.max(rect.top, m.r.top);
      return w > 0 && h > 0 && (w * h) / area >= 0.3;
    });
  };

  const push = (el: Element, r: Omit<ContrastRow, 'ref' | 'selector' | 'webaim'>): void => {
    const ok = /^#[0-9A-F]{6}$/.test(r.foreground) && /^#[0-9A-F]{6}$/.test(r.background);
    const webaim = ok ? `https://webaim.org/resources/contrastchecker/?fcolor=${r.foreground.slice(1)}&bcolor=${r.background.slice(1)}` : '';
    rows.push({ ref: refOf(el), selector: selectorOf(el), webaim, ...r });
  };

  /** One text-contrast row. */
  function addText(el: Element, fg: RGBA, fgCss: string, rect: DOMRect, text: string, check: string, failRule: string, extraBg?: RGBA | null): void {
    const cs = info(el).cs;
    const size = parseFloat(cs.fontSize) || 0;
    if (size < 1) return;
    const weight = parseInt(cs.fontWeight, 10) || (cs.fontWeight === 'bold' ? 700 : 400);
    const large = size >= 24 || (size >= 18.6 && weight >= 700);
    const required = large ? 3 : 4.5;
    const bd = backdrop(el, true);
    if (extraBg && extraBg.a > 0) bd.cands = bd.cands.map((c) => over(extraBg, c));
    const w = worstOf(finalPairs(bd, fg), required);
    const notes: string[] = [];
    let status: boolean | null;
    let unmeasured = false;
    const clipText = (cs.webkitBackgroundClip || cs.backgroundClip) === 'text';
    if (fading.some((f) => f === el || f.contains(el))) { status = null; unmeasured = true; notes.push('Opacity is animating (cross-fade), so the colour was not stable when measured'); }
    else if (clipText) { status = null; unmeasured = true; notes.push('Text is filled with a gradient or image'); }
    else if (el.namespaceURI === SVG_NS) { status = null; unmeasured = true; notes.push('SVG text: shapes behind it are not analysed'); }
    else if (bd.image) { status = null; unmeasured = true; notes.push('Background is an image'); }
    else if (overImage(el, rect, bd)) { status = null; unmeasured = true; notes.push('Text sits over a photo or video'); }
    else if (bd.gradient && !w.all && !w.none) { status = null; notes.push('Gradient: passes on some colour stops only'); }
    else { status = w.all; if (bd.gradient) notes.push('Gradient: worst colour stop shown'); }
    if (bd.icon && status !== null) notes.push('Small background image ignored');

    const fgHex = clipText ? 'image' : hex(w.worst.fg!);
    const bgHex = unmeasured && !clipText ? 'image' : hex(w.worst.bg);
    const r = unmeasured ? null : floor2(w.worst.ratio);
    const label = clean(text, 80);
    push(el, {
      check, text: label, foregroundCss: fgCss, backgroundCss: bd.css, foreground: fgHex, background: bgHex,
      foregroundRgb: clipText ? '' : rgbText(w.worst.fg!), backgroundRgb: bgHex === 'image' ? '' : rgbText(w.worst.bg),
      fontSize: Math.round(size * 100) / 100 + 'px', fontWeight: String(weight), largeText: large,
      contrastRatio: r, requiredRatio: required, wcag: '1.4.3', status, note: notes.join('; '),
    });
    if (status === false) {
      fail(failRule, el, `Foreground ${fgHex} on ${bgHex} produces ${r!.toFixed(2)}:1 (${Math.round(size * 100) / 100}px, weight ${weight}).`,
        { vars: { name: label, ratio: r!.toFixed(2), required }, evidence: notes.join('; ') });
    } else if (status === null) {
      review('contrast.text.review', el, `${notes[0]}. Text colour ${fgHex}.`, { vars: { name: label } });
    } else pass(failRule);
  }

  // ---- 1. All visible text ---------------------------------------------------
  const byElement = new Map<Element, { text: string; rect: DOMRect } | null>();
  const range = document.createRange();
  const visit = (node: Text): void => {
    const raw = node.nodeValue;
    if (!raw || !raw.trim()) return;
    const el = node.parentElement;
    if (!el) return;
    if (byElement.has(el)) { const k = byElement.get(el); if (k) k.text += ' ' + raw; return; }
    byElement.set(el, null);
    if (!isRendered(el)) return;
    const cs = info(el).cs;
    if (cs.visibility !== 'visible') return;
    range.selectNodeContents(node);
    const rect = range.getBoundingClientRect();
    if (rect.width < 0.5 || rect.height < 0.5) return;
    if (rect.right + window.scrollX < 0 || rect.bottom + window.scrollY < 0) return;
    if (isClippedAway(el)) return;
    if (el.closest('[disabled], [aria-disabled="true"]')) return; // WCAG exempts inactive controls
    byElement.set(el, { text: raw, rect });
  };
  const walk = (node: Node): void => {
    for (let c = node.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 3) { visit(c as Text); continue; }
      if (c.nodeType !== 1) continue;
      const e = c as Element;
      if (SKIP_TAGS.has(e.nodeName.toUpperCase())) continue;
      walk(e);
      if (e.shadowRoot) walk(e.shadowRoot);
    }
  };
  if (document.body) walk(document.body);
  byElement.forEach((item, el) => {
    if (!item) return;
    const cs = info(el).cs;
    const svg = el.namespaceURI === SVG_NS;
    const css = svg ? cs.fill : cs.webkitTextFillColor || cs.color;
    const fg = parseColor(css) || parseColor(cs.color);
    const clipText = (cs.webkitBackgroundClip || cs.backgroundClip) === 'text';
    if (!fg || (fg.a === 0 && !clipText)) return;
    addText(el, fg, css, item.rect, item.text, 'Text', 'contrast.text');
  });

  // ---- 2. Text generated by CSS (::before / ::after) -------------------------
  const iconOnly = (c: Element): boolean => !textOf(c, 5);
  document.querySelectorAll('body *').forEach((el) => {
    if (SKIP_TAGS.has(el.nodeName.toUpperCase()) || el.namespaceURI === SVG_NS) return;
    for (const pseudo of ['::before', '::after']) {
      const ps = getComputedStyle(el, pseudo);
      const content = ps.content;
      if (!content || content === 'none' || content === 'normal' || ps.display === 'none') continue;
      const m = /^"((?:[^"\\]|\\.)*)"$/.exec(content);
      if (!m || !m[1].trim()) continue;
      if (!isVisible(el) || el.closest('[disabled], [aria-disabled="true"]')) continue;
      const fg = parseColor(ps.color);
      if (!fg || fg.a === 0) continue;
      const str = m[1];
      if (/[\p{L}\p{N}]/u.test(str)) {
        addText(el, fg, ps.color, el.getBoundingClientRect(), str, 'Text (CSS generated)', 'contrast.text', parseColor(ps.backgroundColor));
      } else if (/[\uE000-\uF8FF]/.test(str)) {
        // Icon-font glyph. Only meaningful when it is the whole label of a control.
        const control = el.closest('a[href], button, [role="button"], [role="link"], [role="tab"], summary');
        if (control && iconOnly(control)) addGraphic(control, [{ c: fg, what: 'icon' }], 'Icon (font)', el);
      }
    }
  });

  // ---- 3. Form fields: value, placeholder, boundary --------------------------
  document.querySelectorAll('input, select, textarea, [role="combobox"], [role="textbox"], [role="searchbox"], [role="spinbutton"]').forEach((el) => {
    const tag = el.nodeName.toUpperCase();
    const type = tag === 'INPUT' ? (el.getAttribute('type') || 'text').toLowerCase() : '';
    if (NO_BOX.has(type) || !isVisible(el) || isDisabled(el) || el.closest('[aria-disabled="true"]')) return;
    const rect = el.getBoundingClientRect();
    const cs = info(el).cs;
    const native = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
    if (native) {
      const field = el as HTMLInputElement;
      let val = '';
      if (tag === 'SELECT') val = (el as HTMLSelectElement).selectedOptions[0]?.text || '';
      else if (type === 'password') val = field.value ? '(password hidden)' : '';
      else val = field.value || (type === 'submit' ? 'Submit' : type === 'reset' ? 'Reset' : '');
      const css = cs.webkitTextFillColor || cs.color;
      const vfg = parseColor(css);
      if (val.trim() && vfg && vfg.a > 0) addText(el, vfg, css, rect, val, BUTTONS.has(type) ? 'Text (button)' : 'Text (field value)', 'contrast.text');
      if ((tag === 'INPUT' || tag === 'TEXTAREA') && field.placeholder && !field.value && !BUTTONS.has(type)) {
        const ps = getComputedStyle(el, '::placeholder');
        let pfg = parseColor(ps.color);
        const pop = parseFloat(ps.opacity);
        if (pfg && pfg.a > 0) {
          if (!isNaN(pop) && pop < 1) pfg = { ...pfg, a: pfg.a * pop };
          addText(el, pfg, ps.color, rect, field.placeholder, 'Placeholder text', 'contrast.placeholder');
        }
      }
    }
    if (!BUTTONS.has(type)) addBoundary(el, 'Form field boundary', false);
  });
  // Checkboxes and radios: only when the author restyled them (browser defaults are exempt).
  document.querySelectorAll('input[type="checkbox"], input[type="radio"], [role="checkbox"], [role="radio"], [role="switch"]').forEach((el) => {
    if (!isVisible(el) || isDisabled(el) || el.closest('[aria-disabled="true"]')) return;
    const nativeBox = el.nodeName === 'INPUT';
    if (nativeBox && info(el).cs.appearance !== 'none') { pass('contrast.nontext'); return; }
    addBoundary(el, nativeBox ? 'Checkbox / radio boundary' : 'Custom checkbox / radio boundary', !nativeBox);
  });

  /** The control must be findable: its border, fill or ring needs 3:1 against what surrounds it. */
  function addBoundary(el: Element, check: string, heuristic: boolean): void {
    const cs = info(el).cs;
    const outerBd = backdrop(el, false);
    const outer = finalPairs(outerBd, null)[0].bg;
    const inner = solidBehind(el, true).color;
    let best = { r: ratio(inner, outer), c: inner, what: 'fill' };
    const consider = (c: RGBA | null, what: string): void => {
      if (!c || c.a === 0) return;
      const solid = rnd(over(c, outer));
      const r = ratio(solid, outer);
      if (r > best.r) best = { r, c: solid, what };
    };
    for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
      const st = cs.getPropertyValue(`border-${side.toLowerCase()}-style`);
      if (parseFloat(cs.getPropertyValue(`border-${side.toLowerCase()}-width`)) > 0 && st !== 'none' && st !== 'hidden') {
        consider(parseColor(cs.getPropertyValue(`border-${side.toLowerCase()}-color`)), 'border');
      }
    }
    if (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) consider(parseColor(cs.outlineColor), 'outline');
    ringColours(cs.boxShadow).forEach((c) => consider(c, 'shadow ring'));
    const status: boolean | null = outerBd.image ? null : best.r >= 3 ? true : heuristic ? null : false;
    const label = clean(nameOf(el) || el.getAttribute('placeholder') || el.getAttribute('name') || el.localName, 80);
    const r = outerBd.image ? null : floor2(best.r);
    push(el, {
      check, text: label, foregroundCss: best.what, backgroundCss: outerBd.css, foreground: hex(best.c), background: outerBd.image ? 'image' : hex(outer),
      foregroundRgb: rgbText(best.c), backgroundRgb: outerBd.image ? '' : rgbText(outer), fontSize: '', fontWeight: '', largeText: null,
      contrastRatio: r, requiredRatio: 3, wcag: '1.4.11', status, note: 'Best of border, fill and ring: ' + best.what,
    });
    if (status === false) fail('contrast.nontext', el, `The ${best.what} colour ${hex(best.c)} against ${hex(outer)} produces ${r!.toFixed(2)}:1.`, { vars: { name: label, ratio: r!.toFixed(2), what: 'boundary (' + best.what + ')' } });
    else if (status === null) review('contrast.nontext.review', el, outerBd.image ? 'The control sits on an image.' : `Best measurable edge is ${r!.toFixed(2)}:1; the visible box may be drawn by another element.`, { vars: { name: label } });
    else pass('contrast.nontext');
  }

  // ---- 4. Icons that are the only label of a control, and named SVG images ---
  function addGraphic(control: Element, colours: { c: RGBA; what: string }[], check: string, at: Element): void {
    if (control.hasAttribute('data-a11y-icon')) return;
    control.setAttribute('data-a11y-icon', '1');
    const { color: bg, bd } = solidBehind(at, true);
    let best = { r: 0, c: colours[0].c };
    for (const k of colours) { const solid = rnd(over(k.c, bg)); const r = ratio(solid, bg); if (r > best.r) best = { r, c: solid }; }
    const status: boolean | null = bd.image ? null : best.r >= 3;
    const label = clean(nameOf(control) || 'unnamed ' + control.localName + ' control', 80);
    const r = bd.image ? null : floor2(best.r);
    push(control, {
      check, text: label, foregroundCss: 'icon colour', backgroundCss: bd.css, foreground: hex(best.c), background: bd.image ? 'image' : hex(bg),
      foregroundRgb: rgbText(best.c), backgroundRgb: bd.image ? '' : rgbText(bg), fontSize: '', fontWeight: '', largeText: null,
      contrastRatio: r, requiredRatio: 3, wcag: '1.4.11', status, note: colours.length > 1 ? 'Best contrasting colour of the icon shown' : '',
    });
    if (status === false) fail('contrast.nontext', control, `Icon colour ${hex(best.c)} against ${hex(bg)} produces ${r!.toFixed(2)}:1.`, { vars: { name: label, ratio: r!.toFixed(2), what: 'icon' } });
    else if (status === null) review('contrast.nontext.review', control, 'The icon sits on an image.', { vars: { name: label } });
    else pass('contrast.nontext');
  }
  const svgColours = (svg: Element): { c: RGBA; what: string }[] => {
    const out: { c: RGBA; what: string }[] = [], seen = new Set<string>();
    const shapes = Array.from(svg.querySelectorAll('path, circle, rect, line, polyline, polygon, ellipse, use, text')).slice(0, 40);
    for (const s of shapes) {
      const cs = getComputedStyle(s);
      if (cs.display === 'none' || cs.visibility !== 'visible') continue;
      const op = parseFloat(cs.opacity) || 1;
      const add = (css: string, alpha: string, what: string) => {
        if (!css || css === 'none' || /^url\(/.test(css)) return;
        const c = parseColor(css);
        if (!c) return;
        const a = c.a * op * (isNaN(parseFloat(alpha)) ? 1 : parseFloat(alpha));
        if (a < 0.1) return;
        const key = hex(c) + a.toFixed(2);
        if (!seen.has(key)) { seen.add(key); out.push({ c: { ...c, a }, what }); }
      };
      add(cs.fill, cs.fillOpacity, 'fill');
      if (parseFloat(cs.strokeWidth) > 0) add(cs.stroke, cs.strokeOpacity, 'stroke');
    }
    return out;
  };
  document.querySelectorAll('a[href], button, [role="button"], [role="link"], [role="tab"], summary').forEach((control) => {
    if (!isVisible(control) || isDisabled(control) || control.closest('[aria-disabled="true"]') || !iconOnly(control)) return;
    const svg = Array.from(control.querySelectorAll('svg')).find(isVisible);
    if (!svg) return;
    const colours = svgColours(svg);
    if (colours.length) addGraphic(control, colours, 'Icon (SVG)', svg);
  });
  document.querySelectorAll('svg[role="img"]').forEach((svg) => {
    if (!isVisible(svg) || !nameOf(svg) || svg.closest('[data-a11y-icon]')) return;
    const colours = svgColours(svg);
    if (colours.length) addGraphic(svg, colours, 'Graphic (SVG)', svg);
  });
  document.querySelectorAll('[data-a11y-icon]').forEach((e) => e.removeAttribute('data-a11y-icon'));

  // ---- 5. Links inside sentences that rely on colour alone -------------------
  document.querySelectorAll('a[href]').forEach((a) => {
    const p = a.parentElement;
    if (!p || !a.textContent!.trim() || !isVisible(a)) return;
    let own = 0;
    for (let c = p.firstChild; c; c = c.nextSibling) if (c.nodeType === 3) own += c.nodeValue!.trim().length;
    if (own < 20) return; // not a link inside running text
    const ai = info(a), pi = info(p);
    if (/underline/.test(ai.cs.textDecorationLine || '')) return;
    if (parseFloat(ai.cs.borderBottomWidth) > 0 && ai.cs.borderBottomStyle !== 'none') return;
    if (ai.cs.fontWeight !== pi.cs.fontWeight || ai.cs.fontStyle !== pi.cs.fontStyle) return;
    if (ai.bg.a > 0 || ai.kind !== 'none') return;
    const lf = parseColor(ai.cs.color), tf = parseColor(pi.cs.color);
    if (!lf || !tf) return;
    const linkCol = finalPairs(backdrop(a, true), lf)[0].fg!;
    const textCol = finalPairs(backdrop(p, true), tf)[0].fg!;
    const r = floor2(ratio(linkCol, textCol));
    const label = clean(a.textContent, 80);
    push(a, {
      check: 'Link vs surrounding text', text: label, foregroundCss: ai.cs.color, backgroundCss: pi.cs.color, foreground: hex(linkCol), background: hex(textCol),
      foregroundRgb: rgbText(linkCol), backgroundRgb: rgbText(textCol), fontSize: '', fontWeight: '', largeText: null,
      contrastRatio: r, requiredRatio: 3, wcag: '1.4.1', status: r >= 3, note: 'Link has no underline; "Background" is the surrounding text colour',
    });
    if (r < 3) fail('contrast.link-in-text', a, `Link colour ${hex(linkCol)} against surrounding text ${hex(textCol)} is ${r.toFixed(2)}:1 and the link has no underline.`, { vars: { name: label, ratio: r.toFixed(2) } });
    else pass('contrast.link-in-text');
  });

  // ---- 6. Borders: border colour (foreground) against the colour next to it (background) ----
  if (borders) {
    const FIELD = 'input, select, textarea, [role="combobox"], [role="textbox"], [role="searchbox"], [role="spinbutton"], [role="checkbox"], [role="radio"], [role="switch"]';
    const CONTROL = 'a[href], button, summary, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [tabindex]:not([tabindex="-1"])';
    interface Group { el: Element; count: number; control: boolean; fg: RGBA; bg: RGBA | null; r: number | null; status: boolean | null; side: string; css: string; label: string }
    const groups = new Map<string, Group>();
    document.querySelectorAll('body *').forEach((el) => {
      if (SKIP_TAGS.has(el.nodeName.toUpperCase()) || el.namespaceURI === SVG_NS || el.matches(FIELD)) return; // fields are checked in step 3
      const cs = info(el).cs;
      const found: { c: RGBA; css: string }[] = [];
      for (const side of ['top', 'right', 'bottom', 'left']) {
        const st = cs.getPropertyValue(`border-${side}-style`);
        if (!(parseFloat(cs.getPropertyValue(`border-${side}-width`)) > 0) || st === 'none' || st === 'hidden') continue;
        const css = cs.getPropertyValue(`border-${side}-color`);
        const c = parseColor(css);
        if (c && c.a > 0.05 && !found.some((f) => f.css === css)) found.push({ c, css });
      }
      if (cs.boxShadow !== 'none') ringColours(cs.boxShadow).forEach((c) => { if (c.a > 0.05) found.push({ c, css: 'box-shadow ring' }); });
      if (!found.length || !isVisible(el) || el.closest('[disabled], [aria-disabled="true"]')) return;

      // The two colours a border sits between: what is outside the element, and the element's own fill.
      const outerBd = backdrop(el, false), innerBd = backdrop(el, true);
      const outerOk = !outerBd.image && !outerBd.gradient, innerOk = !innerBd.image && !innerBd.gradient;
      const outer = finalPairs(outerBd, null)[0].bg, inner = finalPairs(innerBd, null)[0].bg;
      const control = !!el.closest(CONTROL);
      for (const b of found) {
        const solid = rnd(over(b.c, innerOk ? inner : outer));
        const rOut = outerOk ? ratio(solid, outer) : null, rIn = innerOk ? ratio(solid, inner) : null;
        let g: Group;
        if (rOut === null && rIn === null) {
          g = { el, count: 0, control, fg: solid, bg: null, r: null, status: null, side: 'Both sides of the border are images or gradients', css: b.css, label: '' };
        } else {
          const useOut = (rOut ?? 0) >= (rIn ?? 0);
          const best = Math.max(rOut ?? 0, rIn ?? 0);
          if (best < 1.1) continue; // same colour as its surroundings: not a visible border
          const fill = outerOk && innerOk ? ratio(inner, outer) : 0;
          g = { el, count: 0, control, fg: solid, bg: useOut ? outer : inner, r: floor2(best), status: best >= 3 || fill >= 3, css: b.css, label: '',
                side: (useOut ? 'Compared with the colour outside the element' : 'Compared with the element\'s own fill') + (best < 3 && fill >= 3 ? `; the fill itself has ${floor2(fill).toFixed(2)}:1 against its surroundings, so the edge is still visible` : '') + (!outerOk ? '; the outside is an image' : '') };
        }
        const key = [hex(g.fg), g.bg ? hex(g.bg) : 'image', control, el.localName, (el.getAttribute('class') || '').trim().split(/\s+/)[0]].join('|');
        const have = groups.get(key);
        if (have) { have.count++; continue; }
        g.count = 1;
        g.label = clean((control ? nameOf(el.closest(CONTROL)!) : '') || textOf(el, 60) || `<${el.localName}>`, 80);
        groups.set(key, g);
      }
    });
    const weak = new Map<string, { g: Group; total: number; samples: string[] }>();
    groups.forEach((g) => {
      const bgHex = g.bg ? hex(g.bg) : 'image';
      push(g.el, {
        check: g.control ? 'Border (control)' : 'Border', text: g.label, foregroundCss: g.css, backgroundCss: '', foreground: hex(g.fg), background: bgHex,
        foregroundRgb: rgbText(g.fg), backgroundRgb: g.bg ? rgbText(g.bg) : '', fontSize: '', fontWeight: '', largeText: null,
        contrastRatio: g.r, requiredRatio: 3, wcag: '1.4.11', status: g.status,
        note: [g.side, g.count > 1 ? `${g.count} elements share this border` : '', g.control ? '' : 'WCAG needs 3:1 here only if the border carries meaning'].filter(Boolean).join('; '),
      });
      if (g.status === true) { pass('contrast.border', g.count); return; }
      if (g.status === null || g.r === null) return;
      if (g.control) {
        fail('contrast.border', g.el, `Border colour ${hex(g.fg)} against ${bgHex} produces ${g.r.toFixed(2)}:1.${g.count > 1 ? ` ${g.count} controls share this border.` : ''}`, { vars: { name: g.label, ratio: g.r.toFixed(2) }, count: g.count });
      } else {
        const k = hex(g.fg) + '|' + bgHex;
        const w = weak.get(k) || { g, total: 0, samples: [] };
        w.total += g.count;
        if (w.samples.length < 4) w.samples.push(selectorOf(g.el));
        weak.set(k, w);
      }
    });
    weak.forEach((w) => review('contrast.border.review', w.g.el, `${w.total} element(s) have a ${hex(w.g.fg)} border on ${hex(w.g.bg!)}: ${w.g.r!.toFixed(2)}:1, below 3:1. For example: ${w.samples.join('; ')}.`, { count: w.total, vars: { name: w.g.label } }));
  }

  return rows;
}

/** Colours of crisp (unblurred) box-shadows, which are often used as borders or focus rings. */
export function ringColours(boxShadow: string): RGBA[] {
  const out: RGBA[] = [];
  if (!boxShadow || boxShadow === 'none') return out;
  for (const part of boxShadow.split(/,(?![^(]*\))/)) {
    const cm = new RegExp(COLOR_TOKEN).exec(part);
    if (!cm) continue;
    const nums = (part.replace(cm[0], '').match(/-?[\d.]+px/g) || []).map(parseFloat);
    const crisp = (nums[2] || 0) <= 1 && ((nums[3] || 0) > 0 || Math.abs(nums[0] || 0) + Math.abs(nums[1] || 0) > 0);
    const c = parseColor(cm[0]);
    if (crisp && c && c.a > 0) out.push(c);
  }
  return out;
}

export { REF_ATTR };
