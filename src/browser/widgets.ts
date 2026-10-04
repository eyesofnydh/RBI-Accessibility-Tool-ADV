/** Modals, carousels, live regions, date ranges and link/date grouping. */
import { REF_ATTR, clean, fail, isAriaHidden, isRendered, isVisible, nameOf, ownText, pass, refOf, review, selectorOf, tabbables } from './core';

// ------------------------------------------------------------------ modals
export const DIALOG_SEL = 'dialog, [role="dialog"], [role="alertdialog"]';

export function scanModals(): { ref: string; selector: string; name: string; open: boolean }[] {
  const out: { ref: string; selector: string; name: string; open: boolean }[] = [];
  let named = 0;
  document.querySelectorAll(DIALOG_SEL).forEach((d) => {
    const name = nameOf(d);
    out.push({ ref: refOf(d), selector: selectorOf(d), name, open: isVisible(d) });
    if (!name) fail('modal.name', d, `<${d.localName}${d.getAttribute('role') ? ` role="${d.getAttribute('role')}"` : ''}> has no aria-label or aria-labelledby.`);
    else { named++; pass('modal.name'); }
  });
  if (named) review('sr.announcement', null, `Modal dialogs: ${named} dialog(s) have an accessible name. Programmatic accessibility markup: PASS.`, { vars: { feature: 'Modal dialog announcement' } });
  return out;
}

/** Dialogs that are open right now. */
export function openDialogs(): string[] {
  return Array.from(document.querySelectorAll(DIALOG_SEL)).filter(isVisible).map(refOf);
}

/** State of an open dialog: where focus is, and whether the background is blocked. */
export function dialogState(ref: string): { open: boolean; focusInside: boolean; name: string; tabStops: number; backgroundBlocked: boolean; closeRef: string } {
  const d = document.querySelector(`[${REF_ATTR}="${ref}"]`);
  if (!d || !isVisible(d)) return { open: false, focusInside: false, name: '', tabStops: 0, backgroundBlocked: false, closeRef: '' };
  const active = document.activeElement;
  const nativeModal = d.localName === 'dialog' && d.matches(':modal');
  let siblingsBlocked = true;
  for (let n: Element | null = d; n && n !== document.body; n = n.parentElement) {
    const sibs = Array.from(n.parentElement?.children || []).filter((s) => s !== n && isRendered(s) && !['SCRIPT', 'STYLE'].includes(s.nodeName));
    if (sibs.some((s) => !s.hasAttribute('inert') && s.getAttribute('aria-hidden') !== 'true' && (s.textContent || '').trim().length > 0)) { siblingsBlocked = false; break; }
  }
  const close = Array.from(d.querySelectorAll('button, [role="button"], a')).find((b) => /close|dismiss|cancel|\u00d7/i.test(nameOf(b) + ' ' + (b.getAttribute('class') || '')));
  return {
    open: true, focusInside: !!active && (d === active || d.contains(active)), name: nameOf(d), tabStops: tabbables(d).length,
    backgroundBlocked: nativeModal || d.getAttribute('aria-modal') === 'true' || siblingsBlocked, closeRef: close ? refOf(close) : '',
  };
}

// ------------------------------------------------------------------ carousels
const CAROUSEL_SEL = '[aria-roledescription="carousel" i], [class*="carousel" i], [class*="swiper" i], [class*="slick" i], [class*="splide" i], [class*="slider" i]';

function carousels(): Element[] {
  const all = Array.from(document.querySelectorAll(CAROUSEL_SEL)).filter((c) => {
    if (!isVisible(c) || c.matches('input, button, a')) return false;
    const r = c.getBoundingClientRect();
    if (r.width < 200 || r.height < 80) return false;
    const controls = Array.from(c.querySelectorAll('button, [role="button"], a')).some((b) => /prev|next|slide|pause|play/i.test(nameOf(b) + ' ' + (b.getAttribute('class') || '')));
    return controls || !!c.querySelector('[aria-roledescription="slide" i], [class*="slide" i]');
  });
  return all.filter((c) => !all.some((o) => o !== c && o.contains(c)));
}

export function scanCarousels(): { ref: string; selector: string; name: string; hasPause: boolean }[] {
  return carousels().map((c) => {
    const name = nameOf(c) || c.getAttribute('aria-label') || '';
    if (!name) fail('carousel.name', c, 'The carousel container has no accessible name.');
    else pass('carousel.name');
    const clip = c.getBoundingClientRect();
    const off = tabbables(c).filter((t) => {
      if (isAriaHidden(t)) return false;
      const r = t.getBoundingClientRect();
      return r.width > 0 && (r.right <= clip.left + 1 || r.left >= clip.right - 1);
    });
    if (off.length) review('carousel.hidden-focusable', c, `${off.length} focusable element(s) sit in slides outside the visible area and are not hidden or inert, for example "${clean(nameOf(off[0]), 40)}".`, { count: off.length });
    else pass('carousel.hidden-focusable');
    const hasPause = Array.from(c.querySelectorAll('button, [role="button"]')).some((b) => /pause|stop|play/i.test(nameOf(b) + ' ' + (b.getAttribute('class') || '')));
    return { ref: refOf(c), selector: selectorOf(c), name: clean(name, 60), hasPause };
  });
}

let carouselObs: MutationObserver | null = null;
let carouselLog = new Map<Element, number[]>();
/** Starts counting DOM changes inside each carousel (to spot auto-rotation). */
export function carouselWatchStart(): number {
  carouselWatchStop();
  const start = performance.now();
  carouselLog = new Map();
  const list = carousels();
  carouselObs = new MutationObserver((muts) => {
    const now = performance.now() - start;
    for (const m of muts) {
      if (m.type === 'attributes' && m.attributeName === REF_ATTR) continue;
      const host = list.find((c) => c.contains(m.target));
      if (host) carouselLog.set(host, (carouselLog.get(host) || []).concat(now));
    }
  });
  list.forEach((c) => carouselObs!.observe(c, { subtree: true, attributes: true, childList: true, attributeFilter: ['class', 'style', 'aria-hidden', 'hidden', 'inert', 'aria-current', 'aria-selected'] }));
  return list.length;
}
/** Returns the carousels that changed on their own more than one second after watching began. */
export function carouselWatchStop(): { ref: string; changes: number }[] {
  if (!carouselObs) return [];
  carouselObs.disconnect();
  carouselObs = null;
  const out: { ref: string; changes: number }[] = [];
  carouselLog.forEach((times, el) => {
    const late = times.filter((t) => t > 1000);
    if (late.length) out.push({ ref: refOf(el), changes: late.length });
  });
  return out;
}

// ------------------------------------------------------------------ live regions and dynamic widgets
const LIVE_SEL = '[aria-live]:not([aria-live="off"]), [role="status"], [role="alert"], [role="log"], [role="timer"], output';

export function scanLive(): unknown[] {
  const regions = Array.from(document.querySelectorAll(LIVE_SEL)).filter((r) => !r.closest('[aria-hidden="true"]'));
  const inventory = regions.map((r) => ({ selector: selectorOf(r), role: r.getAttribute('role') || r.localName, live: r.getAttribute('aria-live') || '(implicit)', atomic: r.getAttribute('aria-atomic'), busy: r.getAttribute('aria-busy'), text: clean(r.textContent, 80) }));
  const widgets = Array.from(document.querySelectorAll('input[type="search"], [role="searchbox"], [role="search"] input, form[role="search"] input, [class*="pagination" i], nav[aria-label*="pagination" i], [class*="filter" i] select, [class*="filter" i] [role="combobox"]')).filter(isVisible);
  if (widgets.length && !regions.length) {
    review('dynamic.no-live-region', widgets[0], `The page has ${widgets.length} search, filter or pagination control(s) and no aria-live, role="status" or role="alert" region.`);
  } else if (regions.length) {
    pass('dynamic.no-live-region');
    review('sr.announcement', regions[0], `Live regions: ${regions.length} region(s) present (${inventory.slice(0, 3).map((i) => i.role + '/' + i.live).join(', ')}). Programmatic accessibility markup: PASS.`, { vars: { feature: 'Dynamic content announcement' } });
  }
  return inventory;
}

let watchObs: MutationObserver | null = null;
let watch = { total: 0, live: 0, liveText: '' };
/** Starts recording DOM changes, noting those inside live regions. Used by the search test. */
export function mutationWatchStart(): void {
  watch = { total: 0, live: 0, liveText: '' };
  watchObs?.disconnect();
  watchObs = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'attributes') continue;
      const target = m.target.nodeType === 1 ? (m.target as Element) : m.target.parentElement;
      if (!target) continue;
      watch.total++;
      const region = target.closest(LIVE_SEL);
      if (region) { watch.live++; watch.liveText = clean(region.textContent, 100); }
    }
  });
  watchObs.observe(document.body, { subtree: true, childList: true, characterData: true });
}
/** How many DOM changes have been seen so far (the watch keeps running). */
export function mutationWatchPeek(): number { return watch.total; }
export function mutationWatchStop(): { total: number; live: number; liveText: string; active: string; activeIsInput: boolean } {
  watchObs?.disconnect();
  watchObs = null;
  const a = document.activeElement;
  return { ...watch, active: a && a !== document.body ? selectorOf(a) : 'body', activeIsInput: !!a && /^(INPUT|TEXTAREA)$/.test(a.nodeName) };
}

// ------------------------------------------------------------------ date ranges
const MONTH = '(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\\.?';
const DATE = `(?:\\d{1,2}(?:st|nd|rd|th)?\\s+${MONTH},?\\s*\\d{4}|${MONTH}\\s+\\d{1,2},?\\s*\\d{4}|${MONTH}\\s+\\d{4}|\\d{1,2}[./]\\d{1,2}[./]\\d{2,4}|(?:19|20)\\d{2})`;
const RANGE = new RegExp(`(${DATE})\\s*([-\\u2013\\u2014])\\s*(${DATE}|\\d{2}\\b)`, 'i');
const ONE_DATE = new RegExp(`^\\W*(?:${DATE.replace('|(?:19|20)\\d{2})', ')')})\\W*$`, 'i');

export function scanDates(): void {
  let n = 0;
  const examples: string[] = [];
  document.querySelectorAll('body *').forEach((el) => {
    const t = ownText(el);
    if (t.length < 7 || t.length > 300) return;
    const m = RANGE.exec(t);
    if (!m || !isVisible(el) || el.closest('script, style, [aria-hidden="true"], input, textarea')) return;
    if (el.closest('[aria-label]')) { pass('dates.range'); return; }
    n++;
    examples.push(m[0]);
    if (n <= 3) review('dates.range', el, `Date range "${m[0]}" uses "${m[2]}" as the separator.`);
  });
  if (n > 3) review('dates.range', null, `${n - 3} more date ranges use a hyphen or dash, for example ${examples.slice(3, 7).map((e) => `"${e}"`).join(', ')}.`, { count: n - 3 });
}

// ------------------------------------------------------------------ link and date association
export function scanLinkDates(): void {
  const dates = Array.from(document.querySelectorAll('time, body span, body p, body div, body small')).filter((el) => {
    if (el.localName === 'time') return isVisible(el);
    const t = ownText(el);
    return t.length >= 6 && t.length < 40 && ONE_DATE.test(t) && isVisible(el);
  });
  const flagged = new Set<Element>();
  let ok = 0;
  for (const d of dates) {
    let box: Element | null = d.parentElement;
    for (let depth = 0; box && depth < 5 && !box.querySelector('a[href]'); depth++) box = box.parentElement;
    if (!box || !box.querySelector('a[href]')) continue;
    const dateCount = dates.filter((x) => box!.contains(x)).length;
    const linkCount = box.querySelectorAll('a[href]').length;
    if (dateCount >= 2 && linkCount >= 2 && !box.matches('li, article, tr, dl')) {
      if (flagged.size < 5 && ![...flagged].some((f) => f.contains(box!))) {
        flagged.add(box);
        review('assoc.link-date', box, `${dateCount} dates and ${linkCount} links share one <${box.localName}> with no per-item wrapper (first date: "${clean(d.textContent, 30)}").`);
      }
    } else ok++;
  }
  pass('assoc.link-date', ok);
}
