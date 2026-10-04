/** What every scanner receives: the page, the config, the collector and helpers to talk to the in-page library. */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import type { Browser, BrowserContext, Page } from 'playwright';
import type { A11yConfig } from './config';
import type { Collector } from './pipeline';
import type { ColorEntry, PageResult, RawFinding } from './types';
import type { LayoutBaseline } from './browser/layout';
import { pageSlug, sleep, slug } from './utils/misc';

let bundle = '';
/** Bundles src/browser into one script (once per run). */
export async function browserLibrary(): Promise<string> {
  if (bundle) return bundle;
  const entry = path.join(path.dirname(fileURLToPath(import.meta.url)), 'browser', 'index.ts');
  const out = await build({ entryPoints: [entry], bundle: true, format: 'iife', write: false, platform: 'browser', target: 'es2020', logLevel: 'silent' });
  bundle = out.outputFiles[0].text;
  return bundle;
}

export interface RunCtx {
  config: A11yConfig;
  browser: Browser;
  outDir: string;
  shotSeq: { n: number };
  colors: Map<string, ColorEntry>;
  log: (msg: string) => void;
}

/** Opens a browser context with login, HTTPS and the in-page library set up. */
export async function newContext(run: RunCtx, viewport: { width: number; height: number }, deviceScaleFactor = 1, extra: { forcedColors?: 'active' | 'none' } = {}): Promise<BrowserContext> {
  const { config } = run;
  const context = await run.browser.newContext({
    viewport, deviceScaleFactor,
    ignoreHTTPSErrors: config.navigation.ignoreHTTPSErrors,
    httpCredentials: config.auth.httpUsername ? { username: config.auth.httpUsername, password: config.auth.httpPassword || '' } : undefined,
    storageState: config.auth.storageState || undefined,
    reducedMotion: 'no-preference',
    ...extra,
  });
  await context.addInitScript({ content: 'window.__name = window.__name || function (f) { return f; };\n' + (await browserLibrary()) });
  return context;
}

/** Loads a URL and waits for the page to settle (lazy content included). */
export async function openPage(run: RunCtx, page: Page, url: string, retry = true): Promise<void> {
  const nav = run.config.navigation;
  const response = await page.goto(url, { waitUntil: nav.waitUntil, timeout: nav.timeoutMs });
  const status = response?.status() ?? 200;
  if (status === 401) throw new Error(run.config.auth.httpUsername
    ? `The site rejected the username or password (HTTP 401). The tester sent the username "${run.config.auth.httpUsername}" and a password of ${(run.config.auth.httpPassword || '').length} characters. Check both for typing mistakes and extra spaces.`
    : 'The site asks for a username and password (HTTP 401) and none was given. Put them in the .env file or type them in the "Site login" boxes on the start page.');
  if (status === 403) throw new Error('The site refused this computer (HTTP 403). This is usually a network restriction (office network, VPN or an allowed-address list), not a wrong password.');
  if (status >= 400) throw new Error(`The server answered HTTP ${status} for ${url}, so there is no page to test.`);
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => undefined);
  if (nav.autoScroll) {
    await page.evaluate(async () => {
      const step = Math.max(200, window.innerHeight * 0.8);
      for (let y = 0, n = 0; y < document.documentElement.scrollHeight && n < 60; y += step, n++) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); }
      window.scrollTo(0, 0);
    }).catch(() => undefined);
  }
  await sleep(nav.settleMs);
  // A script-rendered page sometimes comes back as an empty shell. Give it a moment, then load it once more.
  const thin = () => page.evaluate(() => (document.body?.innerText || '').trim().length < 30 && document.querySelectorAll('body *').length < 15).catch(() => false);
  if (retry && (await thin())) {
    await sleep(2500);
    if (await thin()) { run.log('    ! The page loaded almost empty; loading it again.'); await openPage(run, page, url, false); }
  }
}

export class PageCtx {
  slug: string;
  baseline: LayoutBaseline | null = null;
  shotsTaken = 0;
  private shotLimit = Number.MAX_SAFE_INTEGER;
  private shotCache = new Map<string, string>();

  /** Allows up to n more issue screenshots (each phase of a page gets its own share of limits.maxScreenshotsPerPage). */
  budget(n: number): void { this.shotLimit = this.shotsTaken + Math.max(0, Math.floor(n)); }
  data: Pick<PageResult, 'contrast' | 'focusOrder' | 'headingTree' | 'landmarkTree' | 'tables' | 'links' | 'images' | 'liveRegions' | 'screenshots' | 'features' | 'errors'> =
    { contrast: [], focusOrder: [], headingTree: '', landmarkTree: '', tables: [], links: [], images: [], liveRegions: [], screenshots: {}, features: {}, errors: [] };

  constructor(public run: RunCtx, public context: BrowserContext, public page: Page, public url: string, public collector: Collector) {
    this.slug = pageSlug(url);
  }
  get config(): A11yConfig { return this.run.config; }

  /** Calls a function of the in-page library. Example: await ctx.dom<string[]>('openDialogs') */
  dom<T>(fn: string, ...args: unknown[]): Promise<T> {
    return this.page.evaluate(([f, a]) => ((window as unknown as { __a11y: Record<string, (...x: unknown[]) => unknown> }).__a11y[f as string](...(a as unknown[]))) as never, [fn, args]) as Promise<T>;
  }

  /** Runs a DOM scanner, stores its findings and pass counts, and returns its data. */
  async scan<T>(name: string, arg?: unknown, label = 'desktop', page: Page = this.page): Promise<{ data: T; findings: RawFinding[] }> {
    const res = await page.evaluate(([n, a]) => (window as unknown as { __a11y: { run: (n: string, a: unknown) => unknown } }).__a11y.run(n as string, a) as never, [name, arg]) as { findings: RawFinding[]; passes: Record<string, number>; data: T };
    this.collector.add(res.findings, label);
    this.collector.addPasses(res.passes);
    return { data: res.data, findings: res.findings };
  }

  private file(prefix: string, name: string, sub = ''): { abs: string; rel: string } {
    const n = String(++this.run.shotSeq.n).padStart(3, '0');
    const fileName = [prefix, this.slug, slug(name, 30), n].filter(Boolean).join('-') + '.png';
    const dir = path.join(this.run.outDir, 'screenshots', sub);
    mkdirSync(dir, { recursive: true });
    return { abs: path.join(dir, fileName), rel: path.posix.join('screenshots', sub, fileName) };
  }

  /** Full-page screenshot. Returns the path relative to the report folder. */
  async shotFull(prefix: string, name: string, sub = '', page: Page = this.page): Promise<string> {
    const f = this.file(prefix, name, sub);
    try { await page.screenshot({ path: f.abs, fullPage: true, animations: 'disabled', caret: 'hide', scale: 'css' }); return f.rel; } catch { return ''; }
  }

  /** Screenshot of what is on screen right now (used while scrolling through a page). Not counted against the per-page limit. */
  async shotScreen(prefix: string, name: string, sub = '', page: Page = this.page): Promise<string> {
    const f = this.file(prefix, name, sub);
    try { await page.screenshot({ path: f.abs, animations: 'disabled', caret: 'hide' }); return f.rel; } catch { return ''; }
  }

  /** Screenshot around one element, with a highlight box drawn on it. */
  async shotElement(ref: string, prefix: string, name: string, sub = '', page: Page = this.page, gentle = false): Promise<string> {
    if (!ref) return '';
    const key = [ref, sub, page.url(), JSON.stringify(page.viewportSize())].join('|');
    if (this.shotCache.has(key)) return this.shotCache.get(key)!;
    if (this.shotsTaken >= this.shotLimit) return '';
    try {
      const call = (r: string | null) => page.evaluate(([x, native]) => (window as unknown as { __a11y: { highlight: (r: string | null, n: boolean) => { x: number; y: number; width: number; height: number } | null } }).__a11y.highlight(x as string | null, native as boolean), [r, !gentle] as const);
      const box = await call(ref);
      if (!box) return '';
      const vp = page.viewportSize() || { width: 1280, height: 800 };
      const pad = 60;
      const x = Math.max(0, Math.min(box.x - pad, vp.width - 40)), y = Math.max(0, Math.min(box.y - pad, vp.height - 40));
      const clip = { x, y, width: Math.max(40, Math.min(vp.width - x, box.width + pad * 2)), height: Math.max(40, Math.min(vp.height - y, box.height + pad * 2)) };
      const f = this.file(prefix, name, sub);
      await page.screenshot({ path: f.abs, clip, animations: 'disabled', caret: 'hide' });
      await call(null);
      this.shotsTaken++;
      this.shotCache.set(key, f.rel);
      return f.rel;
    } catch { return ''; }
  }

  /** Saves an image that is already in memory (used for focus screenshots). */
  saveShot(buffer: Buffer, prefix: string, name: string, sub = ''): string {
    if (this.shotsTaken >= this.shotLimit) return '';
    const f = this.file(prefix, name, sub);
    writeFileSync(f.abs, buffer);
    this.shotsTaken++;
    return f.rel;
  }

  /** Adds screenshots to findings that point at an element and do not have one yet. Failures first. */
  async shootFindings(list: RawFinding[], prefixFor: (r: RawFinding) => string, sub = '', page: Page = this.page): Promise<void> {
    const todo = list.filter((r) => r.el?.ref && r.el.boundingBox && !r.screenshot).sort((a, b) => Number(a.status === null) - Number(b.status === null));
    for (const r of todo) {
      r.screenshot = await this.shotElement(r.el!.ref, prefixFor(r), r.el!.name || r.el!.text || r.el!.tag, sub, page);
    }
  }
}

export interface Scanner {
  /** Key in config.tests that switches this scanner on or off. */
  test: keyof A11yConfig['tests'];
  name: string;
  run(ctx: PageCtx): Promise<void>;
}
