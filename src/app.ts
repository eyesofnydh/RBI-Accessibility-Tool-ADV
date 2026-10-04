/**
 * "npm start": a small local web app.
 *   /            start page: enter a URL, choose the tests, press Run, watch the progress
 *   /report/     the dashboard of the last run
 *   /api/...     used by the start page
 *
 * It listens on 127.0.0.1 only, so nothing outside this computer can reach it.
 * A password typed on the start page is kept in memory for that run and is never written to disk or to the log.
 */
import { exec } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { A11yConfig, loadConfig, parseArgs } from './config';
import { writeReports } from './reporters/index';
import { runAudit } from './run';
import type { RunResult } from './types';
import { escapeHtml } from './utils/misc';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.csv': 'text/csv; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.png': 'image/png', '.yml': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };
const LOCAL = /^(localhost|127\.0\.0\.1)(:\d+)?$/;

interface State {
  running: boolean; stopRequested: boolean; target: string; pagesDone: number;
  log: string[]; error: string; summary: RunResult['totals'] | null;
  /** Pages that could not be loaded or tested. */
  problems: string[];
}

function startPage(): string {
  const css = readFileSync(path.join(HERE, 'reporters', 'dashboard.css'), 'utf8') + readFileSync(path.join(HERE, 'ui', 'start.css'), 'utf8');
  const js = readFileSync(path.join(HERE, 'ui', 'start.js'), 'utf8');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Start a test - RBI accessibility tester</title>
<style>${css}</style>
</head>
<body>
<header class="top" style="padding-bottom:16px">
  <h1>RBI accessibility tester</h1>
  <p style="margin-bottom:0">${escapeHtml('WCAG 2.2 Level AA. Results are true (pass), false (fail) or null (needs manual review).')}</p>
</header>
<main id="view"></main>
<script>${js}</script>
</body>
</html>`;
}

/** Builds the server. Exported so the tests can start it on a free port. */
export function createApp(args: Record<string, string> = {}): http.Server {
  const state: State = { running: false, stopRequested: false, target: '', pagesDone: 0, log: [], error: '', summary: null, problems: [] };
  let outDir = path.resolve(args.out || 'reports');

  const json = (res: http.ServerResponse, code: number, body: unknown): void => {
    res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  };
  const readBody = (req: http.IncomingMessage): Promise<Record<string, unknown>> => new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c: Buffer) => { data += c; if (data.length > 100_000) { reject(new Error('Request too large')); req.destroy(); } });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error('Invalid request')); } });
    req.on('error', reject);
  });

  async function begin(body: Record<string, unknown>): Promise<void> {
    const url = String(body.url || '').trim();
    let parsed: URL;
    try { parsed = new URL(url); } catch { throw new Error('Enter the full page address, starting with https:// or http://'); }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('The address must start with https:// or http://');
    const mode = body.mode === 'crawl' ? 'crawl' : 'test';

    const config: A11yConfig = structuredClone(await loadConfig({ ...args }));
    config.baseUrl = parsed.href;
    const more = Array.isArray(body.urls) ? (body.urls as unknown[]).map((u) => String(u).trim()).filter(Boolean) : [];
    for (const u of more) { try { const x = new URL(u); if (x.protocol !== 'http:' && x.protocol !== 'https:') throw new Error(); } catch { throw new Error(`"${u}" is not a full page address. Each line must start with https:// or http://`); } }
    config.urls = [...new Set(more)].filter((u) => u !== parsed.href).slice(0, 500);
    outDir = path.resolve(config.output.dir);
    const tests = (body.tests || {}) as Record<string, unknown>;
    (Object.keys(config.tests) as (keyof A11yConfig['tests'])[]).forEach((k) => { if (typeof tests[k] === 'boolean') config.tests[k] = tests[k] as boolean; });
    if (config.tests.focus) config.tests.keyboard = true;          // focus is checked during the keyboard test
    if (!config.tests.contrast) config.tests.colorInventory = false; // the inventory is collected with the contrast test
    const clamp = (v: unknown, lo: number, hi: number, d: number) => (Number.isFinite(Number(v)) && v !== '' && v !== null ? Math.min(hi, Math.max(lo, Math.round(Number(v)))) : d);
    config.crawl.maxPages = clamp(body.maxPages, 1, 2000, config.crawl.maxPages);
    config.crawl.maxDepth = clamp(body.maxDepth, 0, 20, config.crawl.maxDepth);
    if (typeof body.username === 'string' && body.username) { config.auth.httpUsername = body.username; config.auth.httpPassword = String(body.password || ''); }

    Object.assign(state, { running: true, stopRequested: false, target: parsed.href, pagesDone: 0, log: [], error: '', summary: null, problems: [] });
    const enabled = Object.entries(config.tests).filter(([, on]) => on).map(([k]) => k);
    state.log.push(`${mode === 'crawl' ? `Crawling from ${parsed.href} (up to ${config.crawl.maxPages} pages, depth ${config.crawl.maxDepth})` : `Testing ${parsed.href}${config.urls.length ? ` and ${config.urls.length} more page(s)` : ''}`}`, `Tests: ${enabled.join(', ')}`, '');
    mkdirSync(outDir, { recursive: true });

    // Not awaited: the request returns at once and the page polls /api/state for progress.
    runAudit(config, mode, (line) => state.log.push(line), { shouldStop: () => state.stopRequested, onPage: (done) => { state.pagesDone = done; } })
      .then((run) => {
        writeReports(run, outDir);
        state.problems = run.pages.filter((p) => p.summary.error).map((p) => `${p.url}: ${p.summary.error}`);
        if (run.pages.length && state.problems.length === run.pages.length) { state.error = 'the page could not be opened. ' + run.pages[0].summary.error!.replace(/^Page could not be tested: /, '').replace(/^page\.goto: /, ''); return; }
        state.summary = run.totals;
        state.log.push('', `Finished. ${run.totals.pages} page(s): ${run.totals.passed} passed, ${run.totals.failed} failed, ${run.totals.manualReview} manual review.`);
      })
      .catch((e: Error) => { state.error = e.message.split('\n')[0]; state.log.push('', 'The run stopped: ' + state.error); })
      .finally(() => { state.running = false; });
  }

  return http.createServer(async (req, res) => {
    try {
      // Only this computer may use the app, and only pages served by the app may send it commands.
      if (!LOCAL.test(req.headers.host || '')) { json(res, 403, { error: 'Local use only' }); return; }
      const origin = req.headers.origin;
      if (req.method === 'POST' && origin && !LOCAL.test(origin.replace(/^https?:\/\//, ''))) { json(res, 403, { error: 'Requests from other sites are not allowed' }); return; }

      const [pathname, query = ''] = (req.url || '/').split('?');
      if (req.method === 'GET' && pathname === '/') {
        res.writeHead(200, { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-store' });
        res.end(startPage());
        return;
      }
      if (req.method === 'GET' && pathname === '/api/state') {
        const since = Math.max(0, Number(new URLSearchParams(query).get('since')) || 0);
        const cfg = await loadConfig({ ...args });
        json(res, 200, {
          running: state.running, stopRequested: state.stopRequested, target: state.target, pagesDone: state.pagesDone,
          log: state.log.slice(since), next: state.log.length, error: state.error, summary: state.summary, problems: state.problems,
          hasReport: existsSync(path.join(outDir, 'index.html')),
          defaults: { url: cfg.baseUrl || '', maxPages: cfg.crawl.maxPages, maxDepth: cfg.crawl.maxDepth, tests: cfg.tests, loginFromEnv: !!cfg.auth.httpUsername },
        });
        return;
      }
      if (req.method === 'POST' && pathname === '/api/run') {
        if (state.running) { json(res, 409, { error: 'A test is already running. Wait for it to finish or stop it first.' }); return; }
        try { await begin(await readBody(req)); json(res, 200, { started: true }); } catch (e) { json(res, 400, { error: (e as Error).message }); }
        return;
      }
      if (req.method === 'POST' && pathname === '/api/stop') {
        if (state.running) { state.stopRequested = true; state.log.push('Stop requested: the run will end when the current page is finished.'); }
        json(res, 200, { stopping: state.running });
        return;
      }
      if (req.method === 'GET' && (pathname === '/report' || pathname.startsWith('/report/'))) {
        if (pathname === '/report') { res.writeHead(302, { Location: '/report/' }).end(); return; }
        const rel = decodeURIComponent(pathname.slice('/report/'.length)) || 'index.html';
        const file = path.normalize(path.join(outDir, rel));
        if (!file.startsWith(outDir + path.sep) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found. Run a test first.'); return; }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        createReadStream(file).pipe(res);
        return;
      }
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
    } catch (e) {
      json(res, 500, { error: (e as Error).message });
    }
  });
}

// Started directly ("npm start"), not imported by a test.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArgs(process.argv.slice(2));
  const port = Number(args.port || process.env.PORT || 4180);
  const server = createApp(args);
  server.on('error', (e: NodeJS.ErrnoException) => {
    console.error(e.code === 'EADDRINUSE' ? `Port ${port} is already in use. Close the other copy, or run: npm start -- --port=4181` : e.message);
    process.exit(1);
  });
  server.listen(port, '127.0.0.1', () => {
    const url = `http://localhost:${port}/`;
    console.log(`RBI accessibility tester is running at ${url}\nLeave this window open while you test. Press Ctrl+C to stop.`);
    if (!args['no-open']) exec(process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`, () => undefined);
  });
}
