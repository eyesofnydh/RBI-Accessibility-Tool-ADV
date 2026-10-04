/** Page-level and structural checks: title, language, ids, headings, lists, tables, landmarks. */
import { clean, fail, isAriaHidden, isRendered, isVisible, nameOf, ownText, pass, review, roleOf, selectorOf, tabbables, textOf } from './core';

// ------------------------------------------------------------------ page meta
const DEVANAGARI_LANGS = /^(hi|mr|ne|sa|kok|mai|bho|doi|sd|ks|brx|new|awa|raj|gom)\b/i;

export function scanPageMeta(): { title: string; lang: string; h1: string } {
  const title = (document.title || '').trim();
  const h1El = Array.from(document.querySelectorAll('h1, [role="heading"][aria-level="1"]')).find(isRendered);
  const h1 = h1El ? clean(h1El.textContent, 150) : '';
  if (!title) fail('page.title-missing', null, 'document.title is empty.');
  else {
    const words = (s: string) => new Set(s.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) || []);
    const tw = words(title), hw = words(h1);
    if (/^(home|untitled|document|page|index|welcome|title|new tab)$/i.test(title)) {
      review('page.title-review', null, `The title is "${title}", which is generic.`);
    } else if (hw.size && ![...hw].some((w) => tw.has(w))) {
      review('page.title-review', null, `The title "${clean(title, 90)}" shares no words with the main heading "${clean(h1, 90)}".`);
    } else pass('page.title-missing');
  }

  const html = document.documentElement;
  const lang = (html.getAttribute('lang') || '').trim();
  if (!lang) fail('lang.missing', html, '<html> has no lang attribute.');
  else if (!/^[a-zA-Z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(lang)) fail('lang.invalid', html, `lang="${lang}" is not a valid language tag.`);
  else pass('lang.missing');

  // Language of parts: Devanagari text on a page that is not in a Devanagari-script language.
  let partsBad = 0, partsOk = 0;
  document.querySelectorAll('body *').forEach((el) => {
    const t = ownText(el);
    if (!/[\u0900-\u097F]{2,}/.test(t) || !isRendered(el) || el.closest('script, style, noscript, option')) return;
    const scoped = el.closest('[lang]')?.getAttribute('lang') || '';
    if (DEVANAGARI_LANGS.test(scoped)) { partsOk++; return; }
    partsBad++;
    if (partsBad <= 5) fail('lang.parts', el, `Devanagari text inside lang="${scoped || 'none'}".`, { vars: { name: clean(t, 40) } });
  });
  if (partsBad > 5) fail('lang.parts', null, `${partsBad - 5} more elements with unmarked Devanagari text.`, { count: partsBad - 5 });
  pass('lang.parts', partsOk);

  // Duplicate ids.
  const byId = new Map<string, Element[]>();
  document.querySelectorAll('[id]').forEach((e) => { const id = e.id; if (id) byId.set(id, (byId.get(id) || []).concat(e)); });
  const referenced = new Set<string>();
  const REF_ATTRS = ['for', 'aria-labelledby', 'aria-describedby', 'aria-controls', 'aria-owns', 'aria-activedescendant', 'aria-errormessage', 'aria-details', 'headers', 'list'];
  document.querySelectorAll(REF_ATTRS.map((a) => `[${a}]`).join(',')).forEach((e) => {
    REF_ATTRS.forEach((a) => (e.getAttribute(a) || '').split(/\s+/).forEach((id) => id && referenced.add(id)));
  });
  const plain: string[] = [];
  byId.forEach((els, id) => {
    if (els.length < 2) return;
    if (referenced.has(id)) fail('ids.duplicate-referenced', els[1], `id="${id}" is used ${els.length} times and is referenced by a label or ARIA attribute.`);
    else plain.push(id);
  });
  if (plain.length) fail('ids.duplicate', null, `${plain.length} duplicate id value(s): ${plain.slice(0, 12).join(', ')}${plain.length > 12 ? ', \u2026' : ''}`, { count: plain.length });
  pass('ids.duplicate-referenced', [...byId.values()].filter((e) => e.length === 1).length ? 1 : 0);
  return { title, lang, h1 };
}

// ------------------------------------------------------------------ headings
function headingLevel(h: Element): number {
  const m = /^h([1-6])$/.exec(h.localName);
  return m ? +m[1] : parseInt(h.getAttribute('aria-level') || '2', 10) || 2;
}

export function scanHeadings(): { tree: string; count: number } {
  const hs = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"]')).filter((h) => !isAriaHidden(h));
  const lines: string[] = [];
  let prev = 0, h1s = 0, okOrder = 0, okText = 0;
  for (const h of hs) {
    const level = headingLevel(h), name = nameOf(h) || clean(h.textContent, 100);
    lines.push('  '.repeat(level - 1) + `H${level} ${name || '(empty)'}`);
    if (level === 1 && isVisible(h)) h1s++;
    if (!name) fail('headings.empty', h, `<${h.localName}> has no text.`, { vars: { tag: h.localName } });
    else okText++;
    if (prev && level > prev + 1) fail('headings.skipped', h, `H${level} follows H${prev}.`, { vars: { name: clean(name, 60), level, prev } });
    else okOrder++;
    if (name.length > 150) review('headings.long', h, `Heading text is ${name.length} characters long.`);
    prev = level;
  }
  pass('headings.empty', okText);
  pass('headings.skipped', okOrder);
  const bodyText = (document.body?.innerText || '').length;
  if (!hs.length) { if (bodyText > 1500) review('headings.none', null, `The page has about ${bodyText} characters of text and no headings.`); }
  else if (!hs.some((h) => headingLevel(h) === 1)) fail('headings.no-h1', null, `The page has ${hs.length} heading(s) and none is level 1.`);
  else pass('headings.no-h1');
  if (h1s > 1) review('headings.multiple-h1', null, `${h1s} visible level 1 headings were found.`);

  // Visual headings without heading markup (heuristic, manual review only).
  const base = parseFloat(getComputedStyle(document.body).fontSize) || 16;
  const seen = new Set<Element>();
  let flagged = 0;
  const NOT_HEADING = 'h1, h2, h3, h4, h5, h6, [role="heading"], a, button, label, li, th, td, nav, header, footer, figcaption, caption, legend, summary, dt, dd, select, [role="tab"], [role="button"], [role="menuitem"], [aria-hidden="true"]';
  document.querySelectorAll('p, div, span, strong, b').forEach((el) => {
    if (flagged >= 10) return;
    const t = ownText(el);
    if (t.length < 3 || t.length > 80 || /[.,;:]$/.test(t) || !/\p{L}/u.test(t)) return;
    let block: Element = el;
    const cs = getComputedStyle(el);
    if (cs.display.startsWith('inline')) {
      const p = el.parentElement;
      if (!p || clean(p.textContent, 200) !== clean(el.textContent, 200)) return;
      block = p;
    }
    if (seen.has(block) || block.closest(NOT_HEADING) || block.querySelector('a, button, input, select')) return;
    seen.add(block);
    if (clean(block.textContent, 200) !== t || !isVisible(block)) return;
    const size = parseFloat(cs.fontSize), weight = parseInt(cs.fontWeight, 10) || 400;
    const prominent = size >= base * 1.25 || (weight >= 600 && size >= base * 1.05);
    const next = block.nextElementSibling;
    if (!prominent || !next || (next.textContent || '').trim().length < 40) return;
    flagged++;
    review('headings.visual', block, `"${clean(t, 60)}" is ${Math.round(size)}px, weight ${weight} (body text is ${Math.round(base)}px) and is followed by content, but is a <${block.localName}>.`);
  });
  return { tree: lines.join('\n'), count: hs.length };
}

// ------------------------------------------------------------------ lists
const BULLET = /^\s*(?:[\u2022\u00B7\u25AA\u25A0\u25CF\u25CB\u25E6\u2023\u27A2\u27A4\u2713\u2714\u25BA\u25B6*]\s+|[-\u2013]\s+\S|\(?\d{1,2}[.)]\s+\S|\(?[a-z][.)]\s+\S)/;
const LIST_ROLES = /^(list|listbox|menu|menubar|tablist|radiogroup|group|toolbar|tree|grid|table|row|rowgroup|navigation)$/;

export function scanLists(): { lists: number } {
  const real = document.querySelectorAll('ul, ol, dl, [role="list"]').length;
  pass('lists.missing', real);
  let heuristic = 0;
  document.querySelectorAll('body, main, div, section, nav, td, article, aside, li, dd').forEach((box) => {
    if ((box.localName !== 'li' && box.localName !== 'dd' && box.closest('ul, ol, dl, [role="list"]')) || box.closest('[aria-hidden="true"]') || !isVisible(box)) return;
    const kids = Array.from(box.children).filter((k) => isRendered(k) && k.localName !== 'br');
    if (kids.length < 3) return;

    // Typed bullets or numbers instead of list markup.
    let run: Element[] = [];
    const flush = () => {
      if (run.length >= 3) fail('lists.fake', box, `${run.length} consecutive <${run[0].localName}> blocks start with a typed bullet or number, for example "${clean(run[0].textContent, 40)}".`, { vars: { count: run.length } });
      run = [];
    };
    for (const k of kids) { if (BULLET.test(k.textContent || '') && !k.querySelector('ul, ol')) run.push(k); else flush(); }
    flush();

    // Repeated similar siblings that are links or contain one link each.
    if (heuristic >= 8 || kids.length < 4 || LIST_ROLES.test(box.getAttribute('role') || '') || box.closest('table, select, [role="tablist"], [role="menu"], [role="listbox"]')) return;
    const tag = kids[0].localName, cls = kids[0].getAttribute('class') || '';
    if (!kids.every((k) => k.localName === tag && (k.getAttribute('class') || '') === cls && !k.hasAttribute('role'))) return;
    if (!(tag === 'a' || tag.includes('-') || cls)) return;
    const linkLike = kids.every((k) => {
      const links = k.localName === 'a' ? 1 : k.querySelectorAll('a[href]').length;
      const len = (k.textContent || '').trim().length;
      return links === 1 && len > 0 && len < 200 && !k.querySelector('ul, ol, table, h1, h2, h3, h4, h5, h6');
    });
    if (!linkLike) return;
    heuristic++;
    review('lists.missing', box, `${kids.length} similar <${tag}> siblings (for example "${clean(kids[0].textContent, 40)}") sit in a <${box.localName}> with no list markup.`);
  });
  return { lists: real };
}

// ------------------------------------------------------------------ tables
export function scanTables(): unknown[] {
  const out: unknown[] = [];
  document.querySelectorAll('table').forEach((table) => {
    if (!isRendered(table) || table.closest('[aria-hidden="true"]')) return;
    const own = <T extends Element>(sel: string) => Array.from(table.querySelectorAll<T>(sel)).filter((c) => c.closest('table') === table);
    const rows = own<HTMLTableRowElement>('tr'), ths = own<HTMLTableCellElement>('th, [role="columnheader"], [role="rowheader"]'), tds = own<HTMLTableCellElement>('td');
    const cols = Math.max(0, ...rows.map((r) => Array.from(r.cells).reduce((n, c) => n + (c.colSpan || 1), 0)));
    const caption = table.querySelector(':scope > caption');
    const role = table.getAttribute('role') || '';
    const presentational = role === 'presentation' || role === 'none';
    const name = clean(caption?.textContent || nameOf(table), 100);
    const looksData = ths.length > 0 || !!caption || (rows.length >= 2 && cols >= 2 && tds.length >= 4 && !table.querySelector('table'));
    out.push({ selector: selectorOf(table), rows: rows.length, columns: cols, headerCells: ths.length, caption: clean(caption?.textContent, 100), name, role, hasThead: !!table.tHead, hasTbody: table.tBodies.length > 0, hasTfoot: !!table.tFoot, scope: ths.filter((t) => t.hasAttribute('scope')).length, headersAttr: tds.filter((t) => t.hasAttribute('headers')).length });

    if (presentational) {
      if (ths.length || caption || table.hasAttribute('summary')) fail('tables.layout-semantics', table, `role="${role}" table contains ${ths.length} <th>${caption ? ' and a <caption>' : ''}.`);
      else pass('tables.layout-semantics');
      return;
    }
    if (!looksData) return;
    if (!ths.length) fail('tables.no-headers', table, `Table has ${rows.length} rows, ${cols} columns and no <th>.`);
    else pass('tables.no-headers');
    if (!name) fail('tables.caption', table, 'No <caption>, aria-label or aria-labelledby.');
    else pass('tables.caption');

    // headers="" must point at ids inside this table.
    let badRef = '';
    for (const td of own<HTMLTableCellElement>('[headers]')) {
      const missing = (td.getAttribute('headers') || '').split(/\s+/).filter((id) => id && !own('#' + CSS.escape(id)).length);
      if (missing.length) { badRef = missing[0]; break; }
    }
    if (badRef) fail('tables.headers-ref', table, `headers refers to id "${badRef}", which is not in this table.`);

    // Complex tables need explicit associations.
    if (ths.length) {
      const firstRowThs = rows[0] ? Array.from(rows[0].cells).filter((c) => c.localName === 'th').length : 0;
      const rowHeaders = rows.slice(1).filter((r) => r.cells[0]?.localName === 'th').length;
      const headRows = table.tHead ? table.tHead.rows.length : 0;
      const spans = ths.some((t) => t.colSpan > 1 || t.rowSpan > 1);
      const complex = (firstRowThs > 0 && rowHeaders > 0) || headRows > 1 || spans;
      const associated = ths.some((t) => t.hasAttribute('scope')) || tds.some((t) => t.hasAttribute('headers'));
      if (complex && !associated) fail('tables.scope', table, `Table has ${firstRowThs} column header(s), ${rowHeaders} row header(s)${headRows > 1 ? `, ${headRows} header rows` : ''}${spans ? ', spanning header cells' : ''} and no scope or headers attributes.`);
      else pass('tables.scope');
    }
  });

  // Tables built with CSS display:table on generic elements.
  let css = 0;
  document.querySelectorAll('body div, body section, body ul').forEach((el) => {
    if (css >= 5 || el.hasAttribute('role') || el.closest('table, [role="table"], [role="grid"]')) return;
    if (getComputedStyle(el).display !== 'table' || !isVisible(el)) return;
    const rowKids = Array.from(el.querySelectorAll(':scope > *, :scope > * > *')).filter((k) => getComputedStyle(k).display === 'table-row');
    if (rowKids.length < 2 || rowKids[0].children.length < 2) return;
    css++;
    review('tables.css-table', el, `A <${el.localName}> is displayed as a table with ${rowKids.length} rows and has no table role.`);
  });
  return out;
}

// ------------------------------------------------------------------ landmarks
const LANDMARK_SEL = 'header, nav, main, footer, aside, section, form, search, [role="banner"], [role="navigation"], [role="main"], [role="contentinfo"], [role="complementary"], [role="region"], [role="form"], [role="search"]';
const LANDMARK_ROLES = new Set(['banner', 'navigation', 'main', 'contentinfo', 'complementary', 'region', 'form', 'search']);

export function scanLandmarks(): { tree: string } {
  const items = Array.from(document.querySelectorAll(LANDMARK_SEL))
    .filter((e) => !isAriaHidden(e))
    .map((el) => ({ el, role: roleOf(el), name: nameOf(el) }))
    .filter((i) => LANDMARK_ROLES.has(i.role) && (i.role !== 'form' || i.name) && (i.role !== 'region' || i.name));
  const set = new Set(items.map((i) => i.el));
  const lines = items.map((i) => {
    let depth = 0;
    for (let p = i.el.parentElement; p; p = p.parentElement) if (set.has(p)) depth++;
    return '  '.repeat(depth) + i.role + (i.name ? ` "${clean(i.name, 60)}"` : '');
  });
  const mains = items.filter((i) => i.role === 'main');
  if (mains.length === 0) fail('landmarks.main', null, 'No <main> or role="main" on the page.');
  else if (mains.length > 1) fail('landmarks.main', mains[1].el, `${mains.length} main landmarks were found.`);
  else pass('landmarks.main');
  for (const role of ['navigation', 'complementary', 'region', 'form', 'banner', 'contentinfo']) {
    const group = items.filter((i) => i.role === role);
    if (group.length < 2) continue;
    const names = group.map((g) => g.name.toLowerCase());
    if (names.some((n) => !n) || new Set(names).size !== names.length) {
      fail('landmarks.unnamed', group.find((g) => !g.name)?.el || group[1].el, `${group.length} "${role}" landmarks; names: ${names.map((n) => n || '(none)').join(', ')}.`, { count: group.length });
    } else pass('landmarks.unnamed');
  }
  // Skip link: one of the first three Tab stops points at an id that exists.
  const first = tabbables().slice(0, 3);
  const skip = first.find((a) => a.localName === 'a' && /^#.+/.test(a.getAttribute('href') || '') && document.getElementById(decodeURIComponent(a.getAttribute('href')!.slice(1))));
  if (skip) pass('landmarks.bypass');
  else review('landmarks.bypass', null, `The first focusable elements are: ${first.map((f) => `"${clean(nameOf(f) || textOf(f), 30)}"`).join(', ') || 'none'}. None is a working skip link.`);
  return { tree: lines.join('\n') };
}
