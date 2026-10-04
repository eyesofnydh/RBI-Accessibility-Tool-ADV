import assert from 'node:assert/strict';
import { createReadStream, existsSync, mkdtempSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DEFAULTS } from '../src/config';
import { writeCsv } from '../src/reporters/csv';
import { writeHtml } from '../src/reporters/html';
import { writeJson } from '../src/reporters/json';
import { writeMarkdown } from '../src/reporters/markdown';
import { runAudit } from '../src/run';
import type { RunResult } from '../src/types';

/**
 * End-to-end check against two local pages:
 *   bad.html   has one planted example of each problem the tool should find
 *   good.html  is clean and must produce no WCAG failure (guards against false alarms)
 */
const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
let server: http.Server, base = '';
const out = mkdtempSync(path.join(tmpdir(), 'a11y-'));
const allTests = Object.fromEntries(Object.keys(DEFAULTS.tests).map((k) => [k, true])) as typeof DEFAULTS.tests;
const config = (url: string) => structuredClone({ ...DEFAULTS, baseUrl: url, output: { dir: out }, carousel: { observeMs: 3500 }, tests: allTests });

before(async () => {
  server = http.createServer((req, res) => {
    const file = path.join(fixtures, path.basename((req.url || '/').split('?')[0]));
    if (!existsSync(file) || file === fixtures) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    createReadStream(file).pipe(res);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
after(() => server.close());

const EXPECTED_FAILS = [
  'contrast.text', 'contrast.placeholder', 'contrast.nontext', 'contrast.link-in-text', 'contrast.border', 'contrast.state',
  'hover.content', 'forms.error-not-exposed', 'dynamic.pagination-not-announced', 'pagination.current', 'spacing.truncated', 'forced.focus-missing',
  'focus.missing', 'focus.unclear', 'focus.link-style',
  'keyboard.not-focusable', 'keyboard.widget-unreachable', 'keyboard.widget-toggle',
  'headings.no-h1', 'headings.skipped', 'headings.empty', 'lists.fake',
  'tables.no-headers', 'tables.caption', 'tables.layout-semantics', 'tables.scope',
  'images.missing-alt-informative', 'images.missing-alt-decorative', 'images.bad-alt',
  'names.missing', 'names.label-in-name', 'links.missing-name', 'links.generic', 'links.new-tab', 'links.external', 'breadcrumb.current',
  'forms.label', 'forms.group', 'aria.broken-ref', 'aria.hidden-focusable', 'aria.role-no-keyboard', 'aria.nested-interactive', 'ids.duplicate-referenced',
  'modal.name', 'modal.focus-in', 'modal.focus-escape', 'lang.missing', 'lang.parts',
  'dynamic.search-not-announced', 'carousel.autoplay', 'responsive.overflow', 'responsive.truncated',
];
const EXPECTED_REVIEWS = ['media.captions', 'contrast.border.review', 'headings.visual', 'lists.missing', 'images.complex', 'hidden.exposed', 'dates.range', 'assoc.link-date', 'page.title-review', 'forms.placeholder-only', 'keyboard.tabindex-positive', 'responsive.fixed-cover'];

let bad: RunResult;
test('the page with planted problems: every expected rule fires', { timeout: 290000 }, async () => {
  bad = await runAudit(config(base + '/bad.html'), 'test', () => undefined);
  const page = bad.pages[0];
  assert.deepEqual(page.errors.filter((e) => /scanner failed|could not be tested|could not run/.test(e)), [], 'no scanner broke');
  const failed = new Set(page.findings.filter((f) => f.status === false).map((f) => f.rule));
  const review = new Set(page.findings.filter((f) => f.status === null).map((f) => f.rule));
  assert.deepEqual(EXPECTED_FAILS.filter((r) => !failed.has(r)), [], 'rules that should have failed');
  assert.deepEqual(EXPECTED_REVIEWS.filter((r) => !review.has(r)), [], 'rules that should need manual review');
  assert.equal(page.summary.wcagAA, false);
  assert.equal(bad.totals.wcagAA, false);
});

test('findings carry the evidence a bug report needs', () => {
  const f = bad.pages[0].findings.find((x) => x.rule === 'contrast.text')!;
  assert.equal(f.wcag, '1.4.3');
  assert.equal(f.level, 'AA');
  assert.match(f.bugSentence, /insufficient color contrast.*4\.47:1.*4\.5:1/);
  assert.ok(f.selector && f.xpath && f.html && f.steps.length >= 2 && f.expected && f.recommendation);
  assert.ok(f.screenshot && existsSync(path.join(out, f.screenshot)), 'screenshot file exists');
  const row = bad.pages[0].contrast.find((c) => c.foreground === '#777777' && c.status === false)!;
  assert.equal(row.contrastRatio, 4.47);
  assert.match(row.webaim, /fcolor=777777&bcolor=FFFFFF/);
});

test('borders are measured like text: border colour against the colour next to it', () => {
  const rows = bad.pages[0].contrast.filter((c) => c.check.startsWith('Border'));
  const weak = rows.find((c) => c.foreground === '#DDDDDD' && c.check === 'Border (control)')!;
  assert.equal(weak.background, '#FFFFFF');
  assert.equal(weak.contrastRatio, 1.35);
  assert.equal(weak.status, false);
  assert.equal(weak.requiredRatio, 3);
  assert.match(weak.webaim, /fcolor=DDDDDD&bcolor=FFFFFF/);
  const strong = rows.find((c) => c.foreground === '#1A3A8A')!;
  assert.equal(strong.status, true);
  const f = bad.pages[0].findings.find((x) => x.rule === 'contrast.border')!;
  assert.equal(f.level, 'Project');
  assert.match(f.bugSentence, /border of "Weak border button".*1\.35:1/);
});

test('hidden content is opened and tested, and hover colours are measured', () => {
  const page = bad.pages[0];
  const inside = page.findings.find((f) => f.context.startsWith('opened:') && f.rule === 'contrast.text');
  assert.ok(inside, 'the pale text inside the closed accordion is found once it is opened');
  assert.match(inside!.context, /Accordion/);
  assert.match(inside!.steps.join(' '), /Open the control "Accordion"/);
  const hover = page.contrast.find((c) => c.check === 'Text (hover)' && c.foreground === '#BBBBBB');
  assert.ok(hover && hover.status === false, 'the hover colour of the link is measured');
  const state = page.findings.find((f) => f.rule === 'contrast.state')!;
  assert.match(state.bugSentence, /on mouse hover/);
  const forced = page.findings.filter((f) => f.rule === 'forced.focus-missing');
  assert.ok(forced.some((f) => f.name === 'Shadow focus link'));
  assert.equal(forced[0].level, 'Best practice');
  assert.match(page.findings.find((f) => f.rule === 'hover.content')!.actual, /cannot be dismissed with Escape/);
  assert.ok(page.errors.some((e) => /nothing was sent to the server/.test(e)), 'the form submit was blocked');
});

test('the same issue on several pages is one group', () => {
  assert.ok(bad.issueGroups.length > 0 && bad.issueGroups.length <= bad.pages[0].findings.length);
  for (const f of bad.pages[0].findings) assert.ok(f.group && bad.issueGroups.some((g) => g.id === f.group));
});

test('keyboard order starts at the top and records every stop', () => {
  const order = bad.pages[0].focusOrder;
  assert.equal(order[0].name, 'Positive tabindex');
  assert.equal(order[1].name, 'Logo link');
  assert.ok(order.length >= 30);
});

test('project rules never change the WCAG verdict, and manual items are never passes', () => {
  for (const f of bad.pages[0].findings) {
    if (f.rule === 'tables.caption' || f.rule === 'focus.link-style' || f.rule === 'links.external') assert.equal(f.level, 'Project');
    if (f.status === null) { assert.equal(f.result, 'MANUAL_REVIEW'); assert.ok(f.manualInstruction); }
  }
  assert.ok(!bad.pages[0].findings.some((f) => /screen reader test passed/i.test(f.bugSentence + f.actual)));
});

test('zoom and small-viewport screenshots are saved in their folders', () => {
  const shots = Object.values(bad.pages[0].screenshots);
  for (const part of ['100-percent/', '200-percent/', '400-percent/', 'responsive-360x256', 'responsive-320x256', 'forced-colors/', 'text-spacing/']) {
    assert.ok(shots.some((s) => s.includes(part)), part);
  }
});

test('all report files are written', () => {
  writeJson(bad, out); writeCsv(bad, out); writeMarkdown(bad, out); writeHtml(bad, out);
  for (const f of ['index.html', 'issue-groups.csv', 'accessibility-report.json', 'accessibility-report.csv', 'accessibility-report.md', 'contrast-report.csv', 'color-inventory.csv', 'links.csv', 'keyboard-focus-order.csv']) {
    assert.ok(existsSync(path.join(out, f)), f);
  }
});

test('the clean page: no WCAG failure is reported', { timeout: 290000 }, async () => {
  const good = await runAudit(config(base + '/good.html'), 'test', () => undefined);
  const fails = good.pages[0].findings.filter((f) => f.status === false && (f.level === 'A' || f.level === 'AA'));
  assert.deepEqual(fails.map((f) => `${f.rule}: ${f.actual}`), []);
  assert.notEqual(good.totals.wcagAA, false);
});

// ------------------------------------------------------------------ the start page app ("npm start")
import { createApp } from '../src/app';

test('start page app: serves the form, refuses outside requests, runs a test and serves the dashboard', { timeout: 120000 }, async () => {
  const app = createApp({ out: path.join(out, 'ui') });
  await new Promise<void>((r) => app.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${(app.address() as { port: number }).port}`;
  const post = (p: string, body: unknown, headers: Record<string, string> = {}) => fetch(origin + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  try {
    const home = await fetch(origin + '/');
    assert.equal(home.status, 200);
    assert.match(await home.text(), /RBI accessibility tester/);

    assert.equal((await post('/api/run', { url: base + '/good.html' }, { Origin: 'https://evil.example' })).status, 403, 'another website cannot start a run');
    assert.equal((await post('/api/run', { url: 'not a url' })).status, 400);
    assert.equal((await fetch(origin + '/report/..%2f..%2fpackage.json')).status, 404, 'no access outside the report folder');

    const tests = Object.fromEntries(Object.keys(DEFAULTS.tests).map((k) => [k, k === 'page' || k === 'headings' || k === 'focus']));
    assert.equal((await post('/api/run', { url: base + '/good.html', mode: 'test', tests, username: 'someone', password: 'secret-value' })).status, 200);
    assert.equal((await post('/api/run', { url: base + '/good.html' })).status, 409, 'only one run at a time');

    let state: { running: boolean; log: string[]; summary: { pages: number } | null; error: string } = { running: true, log: [], summary: null, error: '' };
    for (let i = 0; i < 100 && state.running; i++) {
      await new Promise((r) => setTimeout(r, 500));
      state = await (await fetch(origin + '/api/state?since=0')).json() as typeof state;
    }
    assert.equal(state.error, '');
    assert.equal(state.summary?.pages, 1);
    assert.match(state.log.join('\n'), /Tests: .*keyboard/, 'ticking Focus also runs the keyboard test it depends on');
    assert.ok(!JSON.stringify(state).includes('secret-value'), 'the password is never sent back or logged');
    const dash = await fetch(origin + '/report/');
    assert.equal(dash.status, 200);
    assert.match(await dash.text(), /Accessibility report/);
  } finally {
    app.close();
  }
});

test('hosted mode: password sign-in, allowed hosts, allowed targets and the health check', async () => {
  const app = createApp({ out: path.join(out, 'hosted') }, { user: 'tester', password: 's3cret/+=', allowedHosts: ['my-tester.onrender.com'], allowedTargets: ['stg-rbi.webc.in'] });
  await new Promise<void>((r) => app.listen(0, '127.0.0.1', r));
  const port = (app.address() as { port: number }).port;
  const auth = 'Basic ' + Buffer.from('tester:s3cret/+=').toString('base64');
  /** A request where the Host header can be chosen, as a browser on the hosted address would send it. */
  const get = (p: string, headers: Record<string, string>) => new Promise<number>((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: p, headers }, (res) => { res.resume(); resolve(res.statusCode || 0); }).on('error', reject);
  });
  try {
    assert.equal(await get('/healthz', { Host: 'anything.example' }), 200, 'the health check needs no sign-in');
    assert.equal(await get('/', { Host: 'my-tester.onrender.com' }), 401, 'no password, no entry');
    assert.equal(await get('/', { Host: 'my-tester.onrender.com', Authorization: 'Basic ' + Buffer.from('tester:wrong').toString('base64') }), 401);
    assert.equal(await get('/', { Host: 'my-tester.onrender.com', Authorization: auth }), 200);
    assert.equal(await get('/report/', { Host: 'my-tester.onrender.com' }), 401, 'reports are protected too');
    assert.equal(await get('/', { Host: 'evil.example', Authorization: auth }), 403, 'unknown host names are refused');
    const origin = `http://127.0.0.1:${port}`;
    const run = (url: string) => fetch(origin + '/api/run', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: auth }, body: JSON.stringify({ url }) });
    const refused = await run('https://example.org/');
    assert.equal(refused.status, 400);
    assert.match(((await refused.json()) as { error: string }).error, /may only test: stg-rbi\.webc\.in/);
  } finally {
    app.close();
  }
});

test('hosting options are read from the environment', async () => {
  const { optionsFromEnv } = await import('../src/app');
  const o = optionsFromEnv({ A11Y_APP_PASSWORD: 'x', RENDER_EXTERNAL_HOSTNAME: 'My-App.onrender.com', A11Y_ALLOWED_TARGETS: 'stg-rbi.webc.in, rbi.org.in' });
  assert.deepEqual([o.user, o.password, o.allowedHosts, o.allowedTargets], ['tester', 'x', ['my-app.onrender.com'], ['stg-rbi.webc.in', 'rbi.org.in']]);
});
