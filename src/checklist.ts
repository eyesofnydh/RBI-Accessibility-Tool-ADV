import type { A11yConfig } from './config';
import type { PageResult, RunResult } from './types';

/**
 * Builds the manual test checklist (sections 26 and 46): the things automation cannot prove,
 * each with the pages where it applies.
 */
export function buildChecklist(pages: PageResult[], config: A11yConfig): RunResult['manualChecklist'] {
  const sr = config.manual.screenReader;
  const all = pages.map((p) => p.url);
  const where = (test: (p: PageResult) => boolean) => pages.filter(test).map((p) => p.url);
  const has = (key: string) => where((p) => (p.features[key] || 0) > 0);
  const rule = (prefix: string) => where((p) => p.findings.some((f) => f.rule.startsWith(prefix)));
  const items: RunResult['manualChecklist'] = [
    { area: 'Screen reader', item: 'Reading order', how: `With ${sr}, read each page from top to bottom with the Down Arrow. The order must match the visual order and nothing may be skipped or repeated.`, pages: all },
    { area: 'Screen reader', item: 'Exact announcements', how: `Tab to links, buttons and form fields. ${sr} must speak the name, the role and the state (expanded, selected, checked, required, invalid).`, pages: all },
    { area: 'Screen reader', item: 'External and new-tab link announcements', how: `Tab to each external link. ${sr} must say that it is external or opens a new tab. Internal links must not be announced as external. The links.csv report lists every link as internal or external.`, pages: where((p) => (p.features.externalLinks || 0) + (p.features.newTabLinks || 0) > 0) },
    { area: 'Screen reader', item: 'Modal announcement', how: 'Open each dialog. The dialog name and role must be announced, reading must stay inside the dialog, and the background must not be reachable.', pages: has('dialogs') },
    { area: 'Screen reader', item: 'Search-result announcement', how: 'Run a search. The number of results (or "no results") must be announced without moving focus by hand.', pages: has('search') },
    { area: 'Screen reader', item: 'Dynamic updates', how: 'Use filters, pagination, tabs and forms. Loading, success and error messages must be announced when they appear, and not too late.', pages: where((p) => (p.features.liveRegions || 0) + (p.features.search || 0) > 0) },
    { area: 'Screen reader', item: 'Date-range pronunciation', how: 'Listen to each date range. The separator must be read as "to", not "dash", and must not be skipped.', pages: has('dateRanges') },
    { area: 'Screen reader', item: 'Carousel announcements', how: 'Use the previous and next buttons. The current slide and its position must be announced, and hidden slides must not be read.', pages: has('carousels') },
    { area: 'Screen reader', item: 'Hidden content', how: 'Read through collapsed accordions, closed menus and inactive tabs in browse mode. Hidden text must not be spoken.', pages: rule('hidden.') },
    { area: 'Screen reader', item: 'Repeated focus', how: 'In browse mode, arrow through cards and profile blocks. The same link must not be announced twice (image and text).', pages: rule('links.duplicate-adjacent').concat(rule('aria.nested-interactive')) },
    { area: 'Screen reader', item: 'Link and date relationships', how: 'In lists of notifications or press releases, each date must be read together with the link it belongs to.', pages: rule('assoc.') },
    { area: 'Screen reader', item: 'Table reading', how: 'Move through data tables with Ctrl+Alt+Arrow keys. Column and row headers must be announced with each cell, and the caption on entering the table.', pages: has('tables') },
    { area: 'Screen reader', item: 'Language and pronunciation', how: 'Where Hindi and English are mixed, the voice must switch language. Listen for punctuation, abbreviations and numbers being read sensibly.', pages: rule('lang.') },
    { area: 'Images', item: 'Image descriptions', how: 'Read every alt text against its image. The tool confirms alt text exists; only a person can confirm it describes the image.', pages: has('images') },
    { area: 'Images', item: 'Complex graph description', how: 'For charts, graphs, maps and diagrams, confirm that a text description or data table gives the same information.', pages: has('complexImages') },
    { area: 'Visual', item: 'Visual meaning and context', how: 'Check that information is not given by colour, shape or position alone (required fields, errors, status, chart series).', pages: all },
    { area: 'Visual', item: 'Hover, focus and selected colours', how: 'The tool measures colours as the page loads. Hover over and select links, buttons, tabs and menu items and check those colours with the WebAIM contrast checker.', pages: all },
    { area: 'Visual', item: 'Text over images', how: 'Every "MANUAL_REVIEW" row in the colour contrast report sits on an image or gradient. Check the lightest and darkest pixel behind the text.', pages: where((p) => p.contrast.some((c) => c.status === null)) },
    { area: 'Keyboard', item: 'Menus, dropdowns and dialogs at 200% zoom and at 360x256', how: 'Open the main menu, each dropdown and each dialog at both sizes. They must open, stay inside the screen, and be fully usable with the keyboard.', pages: all },
    { area: 'Forms', item: 'Form validation', how: `The tool submits each form empty (nothing is sent to the server) and checks how the errors are exposed. By hand, also try wrong values, and listen with ${sr}: each error must be announced and tied to its field.`, pages: has('formFields') },
    { area: 'Visual', item: 'Windows High Contrast', how: 'Open the "forced colours full page" screenshot (Screenshots tab), or turn on a Windows contrast theme. Icons, borders of controls, selected states and focus must still be visible.', pages: where((p) => Object.keys(p.screenshots).some((k) => k.startsWith('forced colours'))) },
    { area: 'Visual', item: 'Text spacing', how: 'Open the "text spacing full page" screenshot. Nothing may be cut off or overlapping. The tool checks this automatically; the screenshot is for a second look.', pages: where((p) => Object.keys(p.screenshots).some((k) => k.startsWith('text spacing'))) },
    { area: 'Keyboard', item: 'Content inside menus, accordions and tabs', how: 'The tool opens up to a set number per page (see the note on the Overview tab). Open any that were not reached and check them by hand.', pages: where((p) => (p.features.openable || 0) > (p.features.opened || 0)) },
  ];
  const readers = [sr, 'NVDA + Chrome', 'NVDA + Firefox', 'JAWS + Chrome', 'VoiceOver + Safari (only if macOS testing is required)'].filter((v, i, a) => a.indexOf(v) === i);
  items.unshift({ area: 'Setup', item: 'Screen readers to use', how: readers.join('; ') + '. Playwright does not replace any of them: this tool checks markup, not speech.', pages: [] });
  return items.filter((i) => i.area === 'Setup' || i.pages.length > 0).map((i) => ({ ...i, pages: [...new Set(i.pages)] }));
}
