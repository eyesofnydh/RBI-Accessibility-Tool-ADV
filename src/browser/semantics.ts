/** Images, accessible names, links, forms, ARIA and hidden-content checks. */
import {
  FOCUS_SELECTOR, clean, descriptionOf, fail, isAriaHidden, isClippedAway, isDisabled, isFocusable, isNativeInteractive,
  isRendered, isTabbable, isVisible, nameOf, opacityOf, ownText, pass, review, roleOf, selectorOf, textOf,
} from './core';

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

// ------------------------------------------------------------------ images
const DECOR_FILE = /(spacer|divider|separator|decor|pattern|shape|bullet|arrow|chevron|(^|[-_/])bg([-_.]|$)|background|blank|pixel|ornament)/i;
const COMPLEX_HINT = /(chart|graph|diagram|infographic|organogram|organi[sz]ation[-_ ]?(chart|structure)|flow[-_ ]?chart|(^|[-_ /])map([-_ .]|$)|plot|timeline)/i;
const BAD_ALT = /^(image|img|photo|picture|graphic|icon|untitled|null|undefined|alt|placeholder|spacer)\s*\d*$|\.(png|jpe?g|gif|svg|webp|bmp|avif)$/i;

export function scanImages(): unknown[] {
  const inventory: unknown[] = [];
  const hasLongDesc = (el: Element): boolean =>
    !!(el.getAttribute('aria-describedby') || el.getAttribute('aria-details') || el.getAttribute('longdesc') ||
       ((el.closest('figure')?.querySelector('figcaption')?.textContent || '').trim().length > 40));

  document.querySelectorAll('img').forEach((img) => {
    if (!isRendered(img)) return;
    const r = img.getBoundingClientRect();
    const hasAlt = img.hasAttribute('alt'), alt = (img.getAttribute('alt') || '').trim();
    const role = img.getAttribute('role') || '';
    const file = (img.currentSrc || img.src || '').split(/[?#]/)[0].split('/').pop() || '';
    const hiddenAT = !!img.closest('[aria-hidden="true"]') || role === 'presentation' || role === 'none';
    const control = img.closest('a[href], button, [role="button"], [role="link"]');
    const controlText = control ? clean((control.textContent || ''), 200) : '';
    const functional = !!control && !controlText;
    const decorLook = (r.width <= 24 && r.height <= 24) || DECOR_FILE.test(file);
    const complexLook = COMPLEX_HINT.test(file + ' ' + alt + ' ' + (img.getAttribute('class') || ''));
    const named = !!(img.getAttribute('aria-label') || img.getAttribute('aria-labelledby'));
    const kind = hiddenAT || (hasAlt && !alt && !functional) ? 'Decorative' : functional ? 'Functional' : complexLook ? 'Complex' : hasAlt || named ? 'Informative' : 'Unknown';
    inventory.push({ selector: selectorOf(img), src: file, alt: hasAlt ? alt : null, role, ariaLabel: img.getAttribute('aria-label'), ariaLabelledby: img.getAttribute('aria-labelledby'), title: img.getAttribute('title'), classification: kind, width: Math.round(r.width), height: Math.round(r.height) });

    if (hiddenAT) { pass('images.missing-alt-decorative'); return; }
    if (!hasAlt && !named) {
      if (decorLook) fail('images.missing-alt-decorative', img, `<img src="${file}"> (${Math.round(r.width)}x${Math.round(r.height)}px) has no alt attribute.`);
      else fail('images.missing-alt-informative', img, `<img src="${file}"> (${Math.round(r.width)}x${Math.round(r.height)}px) has no alt attribute.`);
      return;
    }
    if (hasAlt && !alt && !named) {
      const big = r.width * r.height >= 30000 && !!img.closest('main, [role="main"], article');
      if (!functional && big && !decorLook && !controlText) review('images.empty-alt-review', img, `<img src="${file}"> is ${Math.round(r.width)}x${Math.round(r.height)}px inside the main content and has alt="".`);
      else pass('images.missing-alt-decorative');
      return;
    }
    if (BAD_ALT.test(alt)) { fail('images.bad-alt', img, `alt="${alt}".`, { vars: { name: alt } }); return; }
    const caption = clean(img.closest('figure')?.querySelector('figcaption')?.textContent, 200);
    if (alt && ((controlText && norm(controlText) === norm(alt)) || (caption && norm(caption) === norm(alt)))) {
      review('images.unnecessary-alt', img, `alt="${clean(alt, 60)}" repeats the text next to the image.`);
    } else if (alt && decorLook) {
      review('images.unnecessary-alt', img, `The image looks decorative (${Math.round(r.width)}x${Math.round(r.height)}px, file "${file}") but has alt="${clean(alt, 60)}".`);
    } else if (complexLook && !hasLongDesc(img)) {
      review('images.complex', img, `The image looks like a chart, graph, map or diagram (file "${file}", alt "${clean(alt, 60)}") and has no long description.`);
    } else pass('images.missing-alt-informative');
  });

  document.querySelectorAll('svg').forEach((svg) => {
    if (svg.parentElement?.closest('svg') || !isRendered(svg)) return;
    const role = svg.getAttribute('role') || '';
    if (svg.closest('[aria-hidden="true"]') || role === 'presentation' || role === 'none') return;
    const name = nameOf(svg) || clean(svg.querySelector(':scope > title')?.textContent);
    const r = svg.getBoundingClientRect();
    if (role === 'img') { if (!name) fail('images.svg-name', svg, 'role="img" SVG has no aria-label, aria-labelledby or <title>.'); else pass('images.svg-name'); }
    if (svg.closest('a[href], button, [role="button"], [role="link"], [role="tab"], summary, label')) return; // the control's name covers it
    const shapes = svg.querySelectorAll('path, rect, circle, line, text').length;
    if (!name && r.width >= 64 && r.height >= 64) {
      if (shapes > 30 || svg.querySelector('text')) review('images.complex', svg, `A ${Math.round(r.width)}x${Math.round(r.height)}px SVG with ${shapes} shapes has no text alternative; it may be a chart or diagram.`);
      else review('images.svg-review', svg, `A ${Math.round(r.width)}x${Math.round(r.height)}px SVG has no text alternative and is not hidden.`);
    } else if (name && (shapes > 30 || COMPLEX_HINT.test(name)) && r.width >= 200 && !hasLongDesc(svg)) {
      review('images.complex', svg, `The SVG "${clean(name, 60)}" looks complex (${shapes} shapes) and has no long description.`);
    }
    inventory.push({ selector: selectorOf(svg), src: 'inline svg', alt: name || null, role, classification: name ? 'Informative' : 'Unknown', width: Math.round(r.width), height: Math.round(r.height) });
  });

  document.querySelectorAll('canvas').forEach((cv) => {
    if (!isVisible(cv) || cv.closest('[aria-hidden="true"]')) return;
    if (!nameOf(cv) && !(cv.textContent || '').trim() && !hasLongDesc(cv)) review('images.complex', cv, 'A <canvas> has no fallback content, name or description.');
    inventory.push({ selector: selectorOf(cv), src: 'canvas', alt: nameOf(cv) || null, classification: 'Complex', width: cv.width, height: cv.height });
  });
  return inventory;
}

// ------------------------------------------------------------------ accessible names
const CONTROL_SEL = 'button, summary, a[href], input[type="button"], input[type="submit"], input[type="reset"], input[type="image"], [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="switch"], [role="checkbox"]:not(input), [role="radio"]:not(input), [role="option"], [role="treeitem"]';

export function scanNames(): void {
  document.querySelectorAll(CONTROL_SEL).forEach((el) => {
    if (isAriaHidden(el)) return;
    const role = roleOf(el), name = nameOf(el);
    if (!name) {
      if (role === 'link') fail('links.missing-name', el, 'The computed accessible name is empty.', { vars: { href: clean(el.getAttribute('href'), 80) } });
      else fail('names.missing', el, 'The computed accessible name is empty.');
      return;
    }
    pass(role === 'link' ? 'links.missing-name' : 'names.missing');
    // Label in Name: visible text must be part of the accessible name.
    if (el.hasAttribute('aria-label') || el.hasAttribute('aria-labelledby')) {
      const visible = norm(textOf(el, 200));
      if (/\p{L}{2,}/u.test(visible) && isVisible(el)) {
        if (!norm(name).includes(visible)) fail('names.label-in-name', el, `Visible text "${clean(textOf(el), 60)}" is not contained in the accessible name "${clean(name, 60)}".`, { vars: { visible: clean(textOf(el), 60), name: clean(name, 60) } });
        else pass('names.label-in-name');
      }
    }
  });
}

// ------------------------------------------------------------------ links
const GENERIC = /^(click here|here|read more|more|view|view more|view all|see more|see all|learn more|know more|details|more details|link|button|download|continue|go|open|more info|info)$/;
const NEW_TAB = /(new (tab|window)|opens? in|external (link|site|website))/i;

const EXTERNAL_WORD = /(external|another (web)?site|leaves? (this|the) (web)?site|new (tab|window)|opens? in)/i;

export function scanLinks(internalHosts: string[] = []): unknown[] {
  const sameSite = (host: string): boolean => {
    const h = host.replace(/^www\./, ''), here = location.hostname.replace(/^www\./, '');
    return h === here || internalHosts.some((i) => h === i || h.endsWith('.' + i));
  };
  const isExternal = (a: HTMLAnchorElement): boolean => /^https?:$/.test(a.protocol) && !!a.hostname && !sameSite(a.hostname);
  const said = (a: Element): string => [nameOf(a), descriptionOf(a), a.getAttribute('title') || ''].join(' ');
  const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]')).filter((a) => !isAriaHidden(a));
  const inventory = links.map((a) => ({
    text: textOf(a, 100), name: nameOf(a), href: a.getAttribute('href'), type: isExternal(a) ? 'external' : 'internal',
    saysExternalOrNewTab: EXTERNAL_WORD.test(said(a)), target: a.getAttribute('target'), rel: a.getAttribute('rel'), ariaCurrent: a.getAttribute('aria-current'),
  }));

  // External links: does the accessible name or description say so?
  const external = links.filter(isExternal);
  const quiet = external.filter((a) => !EXTERNAL_WORD.test(said(a)));
  if (quiet.length) fail('links.external', quiet[0], `${quiet.length} of ${external.length} external links do not say they are external, for example ${quiet.slice(0, 5).map((a) => `"${clean(nameOf(a) || a.hostname, 40)}" (${a.hostname})`).join(', ')}.`, { count: quiet.length });
  pass('links.external', external.length - quiet.length);
  if (external.length - quiet.length > 0) review('sr.announcement', external.find((a) => !quiet.includes(a))!, `External links: ${external.length - quiet.length} link(s) carry "external" or "new tab" text. Programmatic accessibility markup: PASS.`, { vars: { feature: 'External link announcement' } });
  links.filter((a) => !isExternal(a) && /^https?:$/.test(a.protocol) && /\bexternal\b/i.test(said(a))).slice(0, 5)
    .forEach((a) => review('links.internal-marked-external', a, `The link "${clean(nameOf(a), 50)}" goes to ${a.hostname}${clean(a.pathname, 40)} (this site) but is announced as external.`));

  let badHref = 0;
  for (const a of links) {
    const name = nameOf(a), href = (a.getAttribute('href') || '').trim();
    // Generic link text.
    if (name && GENERIC.test(norm(name))) {
      const title = a.getAttribute('title') || '';
      if (descriptionOf(a) || (title && norm(title) !== norm(name))) { pass('links.generic'); }
      else {
        const box = a.closest('li, p, td, th, dd, figcaption, article');
        const around = box ? clean(box.textContent, 300).replace(clean(a.textContent, 300), '').trim() : '';
        let heading = '';
        for (let p = a.parentElement, d = 0; p && d < 5 && !heading; p = p.parentElement, d++) {
          const hs = Array.from(p.querySelectorAll('h1, h2, h3, h4, h5, h6')).filter((h) => h.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING);
          if (hs.length) heading = clean(hs[hs.length - 1].textContent, 60);
        }
        if (around.length >= 12) review('links.generic.review', a, `Link text "${name}"; surrounding text: "${clean(around, 80)}".`);
        else if (heading) review('links.generic.review', a, `Link text "${name}"; the only context is the heading "${heading}".`);
        else fail('links.generic', a, `Link text "${name}" with no surrounding text, heading or description.`);
      }
    } else if (name) pass('links.generic');
    // Links without a real destination.
    if (href === '#' || href === '' || /^javascript:/i.test(href)) {
      badHref++;
      if (badHref <= 8) review('links.href', a, `href="${clean(href, 40)}".`);
    }
  }
  if (badHref > 8) review('links.href', null, `${badHref - 8} more links have no real destination.`, { count: badHref - 8 });

  // Links that open a new tab.
  const blank = links.filter((a) => (a.getAttribute('target') || '').toLowerCase() === '_blank');
  const silent = blank.filter((a) => {
    const said = [nameOf(a), descriptionOf(a), a.getAttribute('title') || ''].join(' ');
    return !NEW_TAB.test(said);
  });
  if (silent.length) {
    fail('links.new-tab', silent[0], `${silent.length} of ${blank.length} links with target="_blank" do not say they open a new tab, for example ${silent.slice(0, 5).map((a) => `"${clean(nameOf(a) || a.getAttribute('href'), 40)}"`).join(', ')}.`, { count: silent.length });
  }
  pass('links.new-tab', blank.length - silent.length);
  if (blank.length - silent.length > 0) review('sr.announcement', blank.find((a) => !silent.includes(a))!, `New-tab links: ${blank.length - silent.length} link(s) carry "opens in a new tab" text. Programmatic accessibility markup: PASS.`, { vars: { feature: 'New-tab link announcement' } });

  // The same destination linked twice in one item (image link + text link).
  let dup = 0;
  for (const a of links) {
    if (!a.querySelector('img, svg') || clean(a.textContent)) continue;
    const item = a.closest('li, article, [class*="card"], [class*="item"], [class*="profile"], td') || a.parentElement;
    if (!item || item === a || item.matches('body, main') || item.querySelectorAll('a[href]').length > 6) continue;
    const twin = Array.from(item.querySelectorAll<HTMLAnchorElement>('a[href]')).find((b) => b !== a && b.href === a.href && clean(b.textContent));
    if (!twin) continue;
    dup++;
    if (dup <= 5) review('links.duplicate-adjacent', a, `The image link and the text link "${clean(twin.textContent, 50)}" both go to ${clean(a.getAttribute('href'), 60)}.`);
  }
  if (dup > 5) review('links.duplicate-adjacent', null, `${dup - 5} more items link the same destination twice.`, { count: dup - 5 });

  // Breadcrumbs.
  const crumbs = Array.from(document.querySelectorAll('nav[aria-label*="breadcrumb" i], [class*="breadcrumb" i], [aria-label*="breadcrumb" i]')).filter(isRendered);
  crumbs.filter((c) => !crumbs.some((o) => o !== c && o.contains(c))).forEach((bc) => {
    if (!bc.querySelector('a')) return;
    if (bc.querySelector('[aria-current]')) pass('breadcrumb.current');
    else fail('breadcrumb.current', bc, `Breadcrumb "${clean(bc.textContent, 100)}" has no item with aria-current.`);
  });
  return inventory;
}

// ------------------------------------------------------------------ forms
const FIELD_SEL = 'input, select, textarea, [role="textbox"], [role="combobox"], [role="searchbox"], [role="spinbutton"], [role="slider"], [role="listbox"]';
const SKIP_TYPES = new Set(['hidden', 'button', 'submit', 'reset', 'image']);
const PERSONAL = /(^|[^a-z])(e-?mail|phone|mobile|tel|first.?name|last.?name|full.?name|address|pin.?code|zip|postal)/i;

export function scanForms(): void {
  let auto = 0;
  document.querySelectorAll<HTMLInputElement>(FIELD_SEL).forEach((el) => {
    const type = el.localName === 'input' ? (el.getAttribute('type') || 'text').toLowerCase() : '';
    if (SKIP_TYPES.has(type) || isAriaHidden(el) || isDisabled(el)) return;
    // Browsers (and axe) fall back to the placeholder when nothing else names the field.
    const name = nameOf(el) || (el.getAttribute('placeholder') || '').trim(), role = roleOf(el);
    const labelled = (el.labels && el.labels.length > 0) || el.hasAttribute('aria-label') || el.hasAttribute('aria-labelledby');
    if (!name) {
      const prevNode = el.previousSibling;
      const prevText = prevNode && prevNode.nodeType === 3 ? (prevNode.nodeValue || '').trim() : '';
      const near = clean(prevText || (el.previousElementSibling && /^(label|span|b|strong|p|div)$/.test(el.previousElementSibling.localName) ? el.previousElementSibling.textContent : ''), 60);
      fail('forms.label', el, 'The computed accessible name is empty.' + (near ? ` The text "${near}" is next to the field but is not associated with it.` : ''));
    } else {
      pass('forms.label');
      if (!labelled) review('forms.placeholder-only', el, `The name "${clean(name, 60)}" comes only from the ${el.getAttribute('placeholder') ? 'placeholder' : 'title'} attribute.`);
    }
    const labelText = el.labels ? Array.from(el.labels).map((l) => l.textContent || '').join(' ') : '';
    if ((/\*/.test(labelText) || /\b(required|mandatory)\b/i.test(labelText)) && !el.required && el.getAttribute('aria-required') !== 'true') {
      review('forms.required', el, `The label "${clean(labelText, 60)}" marks the field as required, but required/aria-required is not set.`);
    }
    if (el.getAttribute('aria-invalid') === 'true') {
      const ids = ((el.getAttribute('aria-describedby') || '') + ' ' + (el.getAttribute('aria-errormessage') || '')).split(/\s+/).filter(Boolean);
      const text = ids.map((id) => document.getElementById(id)?.textContent || '').join('').trim();
      if (!text) fail('forms.error-association', el, 'aria-invalid="true" with no aria-describedby or aria-errormessage pointing at text.');
      else { pass('forms.error-association'); review('sr.announcement', el, `Field error: "${clean(text, 80)}" is associated with the field. Programmatic accessibility markup: PASS.`, { vars: { feature: 'Error announcement' } }); }
    }
    if (auto < 5 && !el.hasAttribute('autocomplete') && (type === 'email' || type === 'tel' || PERSONAL.test((el.getAttribute('name') || '') + ' ' + el.id))) {
      auto++;
      review('forms.autocomplete', el, `Field "${clean(name || el.getAttribute('name'), 40)}" (type ${type || el.localName}) has no autocomplete attribute.`);
    }
  });

  // Grouping of radios and checkboxes.
  const grouped = (el: Element): boolean => {
    const fs = el.closest('fieldset');
    if (fs && clean(fs.querySelector(':scope > legend')?.textContent)) return true;
    const g = el.closest('[role="radiogroup"], [role="group"]');
    return !!g && !!nameOf(g);
  };
  const byName = new Map<string, HTMLInputElement[]>();
  const loose = new Map<Element, HTMLInputElement[]>();
  document.querySelectorAll<HTMLInputElement>('input[type="radio"], input[type="checkbox"]').forEach((el) => {
    if (!isRendered(el) || isAriaHidden(el)) return;
    if (el.name) { const k = el.type + '|' + el.name + '|' + (el.form ? selectorOf(el.form) : ''); byName.set(k, (byName.get(k) || []).concat(el)); }
    else if (el.type === 'checkbox') { const box = el.parentElement?.parentElement; if (box) loose.set(box, (loose.get(box) || []).concat(el)); }
  });
  byName.forEach((els, key) => {
    if (els.length < 2) return;
    const kind = els[0].type === 'radio' ? 'radio button' : 'checkbox';
    if (grouped(els[0])) pass('forms.group');
    else fail('forms.group', els[0], `${els.length} ${kind}s share name="${els[0].name}" (${els.slice(0, 4).map((e) => `"${clean(nameOf(e), 25)}"`).join(', ')}) with no fieldset/legend or named group.`, { vars: { kind, name: els[0].name }, count: els.length });
  });
  loose.forEach((els, box) => {
    if (els.length < 3 || grouped(els[0])) return;
    review('forms.group.review', box, `${els.length} checkboxes sit together (${els.slice(0, 4).map((e) => `"${clean(nameOf(e), 25)}"`).join(', ')}) with no fieldset/legend or named group.`, { count: els.length });
  });
}

// ------------------------------------------------------------------ ARIA
const NAME_REFS = ['aria-labelledby', 'aria-describedby', 'aria-errormessage'];
const KEYBOARD_ROLES = '[role="button"], [role="link"], [role="checkbox"], [role="switch"], [role="radio"], [role="slider"], [role="textbox"], [role="combobox"], [role="searchbox"], [role="spinbutton"]';
const REDUNDANT = 'button[role="button"], a[href][role="link"], nav[role="navigation"], main[role="main"], img[role="img"], input[type="checkbox"][role="checkbox"], input[type="radio"][role="radio"], h1[role="heading"], h2[role="heading"], h3[role="heading"], h4[role="heading"], table[role="table"], aside[role="complementary"], form[role="form"]';

export function scanAria(): Record<string, number> {
  const usage: Record<string, number> = {};
  const ATTRS = ['role', 'aria-label', 'aria-labelledby', 'aria-describedby', 'aria-hidden', 'aria-expanded', 'aria-selected', 'aria-current', 'aria-live', 'aria-modal', 'aria-controls', 'aria-pressed', 'aria-checked', 'aria-required', 'aria-invalid'];
  ATTRS.forEach((a) => { usage[a] = document.querySelectorAll(`[${a}]`).length; });

  document.querySelectorAll(NAME_REFS.concat('aria-controls').map((a) => `[${a}]`).join(',')).forEach((el) => {
    if (!isRendered(el)) return;
    for (const attr of NAME_REFS.concat('aria-controls')) {
      const v = el.getAttribute(attr);
      if (v === null) continue;
      if (attr === 'aria-controls' && el.getAttribute('aria-expanded') !== 'true') continue; // popup may not be in the DOM yet
      const missing = v.split(/\s+/).filter((id) => id && !document.getElementById(id));
      if (missing.length) fail('aria.broken-ref', el, `${attr}="${clean(v, 80)}": id "${missing[0]}" does not exist.`, { vars: { attr, id: missing[0] } });
      else pass('aria.broken-ref');
    }
  });

  const hiddenRoots = Array.from(document.querySelectorAll('[aria-hidden="true"]'));
  hiddenRoots.filter((h) => !h.parentElement?.closest('[aria-hidden="true"]')).forEach((root) => {
    if (!isRendered(root)) return;
    const inside = Array.from(root.querySelectorAll<HTMLElement>(FOCUS_SELECTOR)).filter(isTabbable);
    if (root.matches(FOCUS_SELECTOR) && isTabbable(root)) inside.unshift(root as HTMLElement);
    inside.slice(0, 5).forEach((f) => fail('aria.hidden-focusable', f, `A focusable <${f.localName}> sits inside aria-hidden="true" (${selectorOf(root)}).`));
    if (!inside.length) pass('aria.hidden-focusable');
  });

  document.querySelectorAll(KEYBOARD_ROLES).forEach((el) => {
    if (isNativeInteractive(el) || isAriaHidden(el) || el.getAttribute('aria-disabled') === 'true') return;
    if (isFocusable(el)) pass('aria.role-no-keyboard');
    else fail('aria.role-no-keyboard', el, `role="${el.getAttribute('role')}" on a <${el.localName}> with no tabindex.`, { vars: { role: el.getAttribute('role') || '' } });
  });

  const red = Array.from(document.querySelectorAll(REDUNDANT));
  if (red.length) fail('aria.redundant-role', red[0], `${red.length} element(s) repeat their native role, for example ${red.slice(0, 4).map((e) => `<${e.localName} role="${e.getAttribute('role')}">`).join(', ')}.`, { count: red.length });

  document.querySelectorAll('a[href], button, [role="button"], [role="link"]').forEach((outer) => {
    if (isAriaHidden(outer)) return;
    const inner = Array.from(outer.querySelectorAll<HTMLElement>(FOCUS_SELECTOR)).find((i) => isRendered(i) && isFocusable(i) && i.tabIndex >= 0);
    if (inner) fail('aria.nested-interactive', outer, `<${outer.localName}> contains a focusable <${inner.localName}>${inner.hasAttribute('tabindex') ? ` (tabindex="${inner.getAttribute('tabindex')}")` : ''}.`);
    else pass('aria.nested-interactive');
  });
  return usage;
}

// ------------------------------------------------------------------ hidden content
const SR_ONLY = /(sr-only|visually-?hidden|screen-?reader|cdk-visually-hidden|a11y-hidden|skip)/i;

export function scanHidden(): void {
  const reported = new Set<Element>();
  const exposed = (el: Element): boolean => isRendered(el) && !el.closest('[aria-hidden="true"], [inert]');
  const report = (el: Element, msg: string): void => {
    if (reported.size >= 8 || [...reported].some((r) => r.contains(el) || el.contains(r))) return;
    reported.add(el);
    const focusables = Array.from(el.querySelectorAll<HTMLElement>(FOCUS_SELECTOR)).filter(isTabbable).length;
    review('hidden.exposed', el, msg + (focusables ? ` It also contains ${focusables} keyboard-focusable element(s).` : ''));
  };

  // Collapsed panels and inactive tab panels.
  document.querySelectorAll('[aria-expanded="false"][aria-controls]').forEach((btn) => {
    const panel = document.getElementById((btn.getAttribute('aria-controls') || '').split(/\s+/)[0]);
    if (!panel || !exposed(panel) || clean(panel.textContent).length < 10) return;
    const r = panel.getBoundingClientRect();
    if (!isVisible(panel) || r.height < 4) report(panel, `The panel controlled by "${clean(nameOf(btn), 40)}" is collapsed (height ${Math.round(r.height)}px) but is not hidden from assistive technology.`);
    else pass('hidden.exposed');
  });
  document.querySelectorAll('[role="tabpanel"]').forEach((p) => {
    if (exposed(p) && clean(p.textContent).length >= 10 && !isVisible(p)) report(p, 'An inactive tab panel is not visible but is still exposed to assistive technology.');
  });

  // Other invisible text that is still exposed (excluding deliberate screen-reader-only text).
  document.querySelectorAll('body *').forEach((el) => {
    if (reported.size >= 8) return;
    const t = ownText(el);
    if (t.length < 20 || !exposed(el) || el.closest('script, style, noscript, template, option, select')) return;
    if (isVisible(el)) return;
    let n: Element | null = el, srOnly = false;
    for (; n; n = n.parentElement) if (SR_ONLY.test(n.getAttribute('class') || '')) { srOnly = true; break; }
    if (srOnly) return;
    const r = el.getBoundingClientRect();
    const tinyClip = isClippedAway(el) && r.width <= 2 && r.height <= 2; // classic visually-hidden technique
    if (tinyClip) return;
    let why = '';
    if (opacityOf(el) <= 0.05) why = 'has opacity 0';
    else if (r.right + window.scrollX < -200) why = 'is positioned off-screen';
    else {
      for (let a: Element | null = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const cs = getComputedStyle(a);
        if (cs.overflowY !== 'visible' && a.clientHeight <= 2 && a.scrollHeight > 20) { why = 'sits in a collapsed container (height 0, overflow hidden)'; break; }
      }
    }
    if (why) report(el, `The text "${clean(t, 60)}" ${why} but is still exposed to assistive technology.`);
  });

  // Visible text hidden from assistive technology.
  let vis = 0;
  document.querySelectorAll('[aria-hidden="true"]').forEach((el) => {
    if (vis >= 5 || el.parentElement?.closest('[aria-hidden="true"]') || !isVisible(el)) return;
    const t = textOf(el, 200);
    if (t.length < 30) return;
    vis++;
    review('hidden.visible-aria-hidden', el, `Visible text "${clean(t, 80)}" is inside aria-hidden="true".`);
  });
}
