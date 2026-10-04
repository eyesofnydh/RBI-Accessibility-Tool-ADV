import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export interface Viewport { width: number; height: number }

export interface A11yConfig {
  /** Start page. Can also come from TARGET_URL or --url. */
  baseUrl?: string;
  /** Extra pages to test in every run (absolute, or relative to baseUrl). */
  urls: string[];
  standard: 'WCAG22AA';
  /** Chromium is fully supported. Firefox and WebKit run everything except the click-listener check. */
  browser: 'chromium' | 'firefox' | 'webkit';
  headless: boolean;
  desktopViewport: Viewport;
  /** Small viewports for the responsive test. */
  viewports: Viewport[];
  /** 1 = 100%, 2 = 200%. Zoom is simulated by dividing the viewport and raising the device scale. */
  zoomLevels: number[];
  /** Also test 400% (1280px becomes 320px wide), the WCAG 1.4.10 reflow condition. */
  optionalReflow400: boolean;
  auth: {
    /** HTTP Basic Auth. Prefer the A11Y_HTTP_USERNAME / A11Y_HTTP_PASSWORD environment variables. */
    httpUsername?: string;
    httpPassword?: string;
    /** Path to a Playwright storageState file, for sites with a login form. */
    storageState?: string;
  };
  navigation: { waitUntil: 'load' | 'domcontentloaded' | 'networkidle'; timeoutMs: number; settleMs: number; autoScroll: boolean; ignoreHTTPSErrors: boolean };
  tests: {
    contrast: boolean; keyboard: boolean; focus: boolean; headings: boolean; images: boolean; links: boolean; aria: boolean;
    responsive: boolean; zoom: boolean; forms: boolean; tables: boolean; lists: boolean; modals: boolean; landmarks: boolean;
    dynamicContent: boolean; carousel: boolean; screenReader: boolean; page: boolean; axe: boolean; colorInventory: boolean;
    /** Opens menus, accordions and tabs and tests what was hidden. */
    openedContent: boolean;
    /** Submits forms empty (data-carrying requests are blocked) and checks how errors are exposed. */
    formErrors: boolean;
    /** Tooltips and other content shown on hover or focus (WCAG 1.4.13). */
    hoverContent: boolean;
    /** Windows High Contrast emulation. */
    forcedColors: boolean;
    /** WCAG 1.4.12 text spacing. */
    textSpacing: boolean;
  };
  limits: {
    maxTabStops: number; maxWidgetTests: number; maxClickableChecks: number;
    maxScreenshotsPerPage: number; maxFindingsPerRule: number; smallViewportTabStops: number;
    /** Screenfuls captured while scrolling a page at each zoom level and small viewport. */
    maxScrollScreens: number;
    /** Menus, accordions and tabs opened per page, and how many levels deep. */
    maxOpenStates: number; maxOpenDepth: number;
    /** Controls checked for hover and focus colours, tooltips tried, forms submitted. */
    maxStateChecks: number; maxTooltips: number; maxForms: number;
  };
  crawl: {
    maxPages: number; maxDepth: number;
    /** Regular expressions (as strings). A URL must match one include (if any) and no exclude. */
    include: string[]; exclude: string[];
    ignoreQueryParams: string[]; maxQueryVariantsPerPath: number;
    skipDownloads: boolean; downloadExtensions: string[];
  };
  /** Search test: types a query and checks whether the result update is exposed to assistive technology. */
  search: { enabled: boolean; query: string; input?: string; submit?: string };
  /** Modal test: controls that open a dialog. Auto-detect uses aria-haspopup="dialog". */
  modals: { triggers: { name: string; open: string }[]; autoDetect: boolean; max: number };
  carousel: { observeMs: number };
  layout: { fixedCoverRatio: number };
  /** borders: also measure every visible border colour against the colour next to it (3:1). */
  /** states: also measure text colours with hover and focus forced on (Chromium only). */
  contrast: { borders: boolean; states: boolean };
  rbi: {
    /** RBI design rule: focused links are underlined and change colour. */
    linkFocusUnderlineAndColor: boolean;
    /** When true, RBI project-rule failures also turn the overall verdict to FAIL. */
    projectRulesAffectVerdict: boolean;
  };
  /** Screen reader named in the manual checklist. */
  manual: { screenReader: string };
  /** Hosts that count as internal besides the page's own host. Example: ['rbi.org.in'] */
  site: { internalHosts: string[] };
  axe: { tags: string[]; disableRules: string[] };
  lighthouse: { enabled: boolean };
  output: { dir: string };
}

export const DEFAULTS: A11yConfig = {
  urls: [],
  standard: 'WCAG22AA',
  browser: 'chromium',
  headless: true,
  desktopViewport: { width: 1920, height: 945 },
  viewports: [{ width: 360, height: 256 }, { width: 320, height: 256 }],
  zoomLevels: [1, 2],
  optionalReflow400: true,
  auth: {},
  navigation: { waitUntil: 'load', timeoutMs: 45000, settleMs: 1200, autoScroll: true, ignoreHTTPSErrors: true },
  tests: {
    contrast: true, keyboard: true, focus: true, headings: true, images: true, links: true, aria: true,
    responsive: true, zoom: true, forms: true, modals: true, landmarks: true,
    // Table markup and list markup are optional: off unless ticked on the start page or asked for with --with=tables,lists
    tables: false, lists: false,
    dynamicContent: true, carousel: true, screenReader: true, page: true, axe: true, colorInventory: true,
    openedContent: true, formErrors: true, hoverContent: true, forcedColors: true, textSpacing: true,
  },
  limits: { maxTabStops: 150, maxWidgetTests: 12, maxClickableChecks: 40, maxScreenshotsPerPage: 60, maxFindingsPerRule: 40, smallViewportTabStops: 25, maxScrollScreens: 12, maxOpenStates: 12, maxOpenDepth: 2, maxStateChecks: 120, maxTooltips: 10, maxForms: 3 },
  crawl: {
    maxPages: 50, maxDepth: 3, include: [], exclude: ['logout', 'log-out', 'signout', 'sign-out'],
    ignoreQueryParams: ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid', 'sessionid'],
    maxQueryVariantsPerPath: 3, skipDownloads: true,
    downloadExtensions: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'zip', 'rar', 'csv', 'jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'mp4', 'mp3', 'xml', 'json', 'txt'],
  },
  search: { enabled: true, query: 'bank' },
  modals: { triggers: [], autoDetect: true, max: 3 },
  carousel: { observeMs: 6000 },
  layout: { fixedCoverRatio: 0.5 },
  contrast: { borders: true, states: true },
  rbi: { linkFocusUnderlineAndColor: true, projectRulesAffectVerdict: false },
  manual: { screenReader: 'JAWS + Chrome' },
  site: { internalHosts: [] },
  axe: { tags: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'], disableRules: [] },
  lighthouse: { enabled: false },
  output: { dir: 'reports' },
};

type Deep<T> = { [K in keyof T]?: T[K] extends object ? (T[K] extends unknown[] ? T[K] : Deep<T[K]>) : T[K] };
export type UserConfig = Deep<A11yConfig>;

/** Helper for accessibility.config.ts so the editor shows every option. */
export function defineConfig(c: UserConfig): UserConfig { return c; }

function merge<T>(base: T, over: Deep<T> | undefined): T {
  if (!over) return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(over as Record<string, unknown>)) {
    if (v === undefined) continue;
    const b = out[k];
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && b && typeof b === 'object' && !Array.isArray(b) ? merge(b, v as never) : v;
  }
  return out as T;
}

/** Reads --key=value and --flag arguments. Example: parseArgs(['--url=https://x', '--headed']) */
export function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const a of argv) {
    const m = /^--([\w-]+)(?:=(.*))?$/.exec(a);
    if (m) out[m[1]] = m[2] ?? 'true';
    else if (/^https?:\/\//.test(a) && !out.url) out.url = a;
  }
  return out;
}

/** Loads accessibility.config.ts, then applies environment variables and command-line options on top. */
export async function loadConfig(args: Record<string, string>): Promise<A11yConfig> {
  if (typeof (process as unknown as { loadEnvFile?: (p: string) => void }).loadEnvFile === 'function' && existsSync('.env')) {
    try { (process as unknown as { loadEnvFile: (p: string) => void }).loadEnvFile('.env'); } catch { /* ignore a malformed .env */ }
  }
  const file = path.resolve(args.config || 'accessibility.config.ts');
  let user: UserConfig = {};
  if (existsSync(file)) user = ((await import(pathToFileURL(file).href)) as { default: UserConfig }).default || {};
  const cfg = merge(structuredClone(DEFAULTS), user); // a copy, so options for one run never change the defaults

  cfg.baseUrl = args.url || process.env.TARGET_URL || cfg.baseUrl;
  cfg.auth.httpUsername = process.env.A11Y_HTTP_USERNAME || cfg.auth.httpUsername;
  cfg.auth.httpPassword = process.env.A11Y_HTTP_PASSWORD || cfg.auth.httpPassword;
  if (args.pages) {
    // A text file with one address per line. Empty lines and lines starting with # are ignored.
    const list = readFileSync(path.resolve(args.pages), 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
    cfg.urls = [...cfg.urls, ...list];
    if (!cfg.baseUrl && list.length) cfg.baseUrl = list[0];
  }
  if (args.browser) cfg.browser = args.browser as A11yConfig['browser'];
  if (args.headed) cfg.headless = false;
  if (args.out) cfg.output.dir = args.out;
  if (args['max-pages']) cfg.crawl.maxPages = Number(args['max-pages']);
  if (args['max-depth']) cfg.crawl.maxDepth = Number(args['max-depth']);
  if (args.reflow400) cfg.optionalReflow400 = args.reflow400 !== 'false';
  const keys = Object.keys(cfg.tests) as (keyof A11yConfig['tests'])[];
  if (args.only) { const only = args.only.split(','); keys.forEach((k) => { cfg.tests[k] = only.includes(k); }); }
  if (args.with) args.with.split(',').forEach((k) => { if (k in cfg.tests) cfg.tests[k as keyof A11yConfig['tests']] = true; });
  if (args.skip) args.skip.split(',').forEach((k) => { if (k in cfg.tests) cfg.tests[k as keyof A11yConfig['tests']] = false; });
  return cfg;
}
