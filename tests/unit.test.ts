import assert from 'node:assert/strict';
import { test } from 'node:test';
import { floor2, luminance, over, ratio } from '../src/browser/color';
import { DEFAULTS, parseArgs } from '../src/config';
import { Frontier, normalizeUrl } from '../src/crawler/crawler';
import { pageSlug, slug, toCsv } from '../src/utils/misc';
import { CRITERIA } from '../src/wcag/criteria';
import { RULES, ruleFor } from '../src/wcag/rules';

const rgb = (hex: string) => ({ r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16), a: 1 });

test('contrast ratio matches the WCAG formula', () => {
  assert.equal(floor2(ratio(rgb('#000000'), rgb('#FFFFFF'))), 21);
  assert.equal(floor2(ratio(rgb('#767676'), rgb('#FFFFFF'))), 4.54);
  assert.equal(luminance(rgb('#FFFFFF')), 1);
});

test('a failing ratio is never rounded up into a pass', () => {
  const r = ratio(rgb('#777777'), rgb('#FFFFFF')); // 4.478...
  assert.equal(floor2(r), 4.47);
  assert.ok(r < 4.5);
});

test('semi-transparent colours are blended before measuring', () => {
  const grey = over({ r: 0, g: 0, b: 0, a: 0.5 }, rgb('#FFFFFF'));
  assert.deepEqual([Math.round(grey.r), Math.round(grey.g), Math.round(grey.b)], [128, 128, 128]);
});

test('URLs are normalised so a page is queued once', () => {
  const c = DEFAULTS.crawl;
  assert.equal(normalizeUrl('/about-us/?utm_source=x#top', 'https://site.org/', c), 'https://site.org/about-us');
  assert.equal(normalizeUrl('?b=2&a=1', 'https://site.org/list', c), 'https://site.org/list?a=1&b=2');
  assert.equal(normalizeUrl('mailto:a@b.c', 'https://site.org/', c), null);
  assert.equal(normalizeUrl('tel:123', 'https://site.org/', c), null);
  assert.equal(normalizeUrl('javascript:void(0)', 'https://site.org/', c), null);
  assert.equal(normalizeUrl('/files/report.pdf', 'https://site.org/', c), null);
});

test('the crawler stays on the site and respects its limits', () => {
  const f = new Frontier('https://site.org/', { ...DEFAULTS.crawl, maxDepth: 1, maxQueryVariantsPerPath: 2 });
  assert.equal(f.next()?.url, 'https://site.org/');
  f.add(['https://site.org/a', 'https://www.site.org/a#x', 'https://other.org/b', 'https://site.org/logout', 'https://site.org/l?p=1', 'https://site.org/l?p=2', 'https://site.org/l?p=3'], 0);
  const urls: string[] = [];
  for (let n = f.next(); n; n = f.next()) urls.push(n.url);
  assert.deepEqual(urls, ['https://site.org/a', 'https://site.org/l?p=1', 'https://site.org/l?p=2']);
  f.add(['https://site.org/deep'], 1); // depth 2 is beyond maxDepth 1
  assert.equal(f.next(), undefined);
});

test('table markup and list markup are optional: off by default, on with --with', async () => {
  assert.equal(DEFAULTS.tests.tables, false);
  assert.equal(DEFAULTS.tests.lists, false);
  const { loadConfig } = await import('../src/config');
  const cfg = await loadConfig({ with: 'tables,lists', config: 'no-such-file.ts' });
  assert.equal(cfg.tests.tables, true);
  assert.equal(cfg.tests.lists, true);
  assert.equal((await loadConfig({ config: 'no-such-file.ts' })).tests.tables, false);
});

test('command-line options are parsed', () => {
  assert.deepEqual(parseArgs(['--url=https://x.org', '--headed', '--max-pages=5']), { url: 'https://x.org', headed: 'true', 'max-pages': '5' });
});

test('file names are safe', () => {
  assert.equal(slug('About Us / RBI'), 'about-us-rbi');
  assert.equal(pageSlug('https://x.org/about-us/history/'), 'about-us-history');
  assert.equal(pageSlug('https://x.org/'), 'home');
});

test('CSV cells are quoted and formula text is neutralised', () => {
  const csv = toCsv(['A', 'B'], [['x,y', '=SUM(1)']], 1);
  assert.ok(csv.includes('"x,y"'));
  assert.ok(csv.includes("'=SUM(1)"));
});

test('every rule points at a known criterion and has the text a bug report needs', () => {
  for (const r of Object.values(RULES)) {
    assert.ok(r.title && r.expected && r.fix && r.why, r.id + ' is missing text');
    if (r.wcag) assert.ok(CRITERIA[r.wcag], `${r.id} refers to unknown criterion ${r.wcag}`);
    else assert.ok(r.level, `${r.id} has no criterion, so it must be a Project or Best practice rule`);
  }
  assert.equal(ruleFor('zoom.fixed-cover')?.category, 'Zoom');
  assert.equal(ruleFor('reflow.overflow')?.wcag, '1.4.10');
});
