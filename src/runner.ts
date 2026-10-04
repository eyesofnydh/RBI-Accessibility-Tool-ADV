import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { PageResult, RuleMeta } from './types';
import { PageCtx, RunCtx, Scanner, newContext, openPage } from './context';
import { Collector } from './pipeline';
import { aria } from './scanners/aria';
import { axe } from './scanners/axe';
import { carousel } from './scanners/carousel';
import { contrast } from './scanners/contrast';
import { dynamicContent } from './scanners/dynamic-content';
import { forms } from './scanners/forms';
import { headings } from './scanners/headings';
import { images } from './scanners/images';
import { keyboard } from './scanners/keyboard';
import { landmarks } from './scanners/landmarks';
import { links } from './scanners/links';
import { lists } from './scanners/lists';
import { modal } from './scanners/modal';
import { pageMeta } from './scanners/page';
import { responsive } from './scanners/responsive';
import { screenReader } from './scanners/screen-reader';
import { tables } from './scanners/tables';
import { zoom } from './scanners/zoom';
import { forcedColors } from './scanners/forced-colors';
import { formErrors } from './scanners/form-errors';
import { hoverContent } from './scanners/hover';
import { openedContent } from './scanners/opened-content';
import { textSpacing } from './scanners/text-spacing';

/**
 * Order matters.
 * 1. STATIC scanners read the untouched page at desktop size.
 * 2. INTERACTIVE scanners press keys and open things.
 * 3. LAYOUT scanners reload the page at other sizes.
 * To add a scanner: write it in src/scanners, add its switch to config.tests, and put it in one of these lists.
 */
const STATIC: Scanner[] = [pageMeta, headings, lists, tables, images, links, aria, forms, landmarks, screenReader, contrast, axe];
const INTERACTIVE: Scanner[] = [carousel, keyboard, hoverContent, openedContent, modal, formErrors, dynamicContent];
const LAYOUT: Scanner[] = [textSpacing, responsive, zoom, forcedColors];

/** Runs every enabled scanner on one URL. */
export async function testPage(run: RunCtx, url: string): Promise<{ result: PageResult; links: string[]; axeMeta: Record<string, RuleMeta> }> {
  const started = Date.now();
  const { config } = run;
  const collector = new Collector();
  const context = await newContext(run, config.desktopViewport, 1);
  const page = await context.newPage();
  const ctx = new PageCtx(run, context, page, url, collector);
  let title = '', links: string[] = [], ariaFile = '';

  const group = async (list: Scanner[], shootAfterEach = false): Promise<void> => {
    for (const s of list) {
      if (!config.tests[s.test]) continue;
      // Interactive scanners may reload the page, so their findings are photographed straight away.
      try { await s.run(ctx); if (shootAfterEach) await ctx.shootFindings(collector.raws.filter((r) => r.source === 'interaction' && r.context === 'desktop'), (r) => prefix(r.rule)); } catch (e) {
        const msg = `${s.name} scanner failed: ${(e as Error).message.split('\n')[0]}`;
        ctx.data.errors.push(msg);
        run.log('    ! ' + msg);
      }
    }
  };
  const prefix = (rule: string): string => 'WCAG-' + (collector.meta(rule).wcag || 'RBI');

  try {
    await openPage(run, page, url);
    title = await page.title();
    links = await ctx.dom<string[]>('pageLinks');
    ctx.data.screenshots['desktop full page (before tests)'] = await ctx.shotFull('page', 'before-tests');
    if (config.tests.responsive || config.tests.zoom || config.tests.textSpacing) ctx.baseline = await ctx.dom('layoutSnapshot');

    await group(STATIC);
    try {
      const snapshot = await page.locator('body').ariaSnapshot();
      const dir = path.join(run.outDir, 'accessibility-tree');
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, ctx.slug + '.yml'), `# Accessibility tree (ARIA snapshot) of ${url}\n` + snapshot);
      ariaFile = path.posix.join('accessibility-tree', ctx.slug + '.yml');
    } catch (e) { ctx.data.errors.push('Accessibility tree snapshot: ' + (e as Error).message.split('\n')[0]); }
    const max = config.limits.maxScreenshotsPerPage;
    ctx.budget(max * 0.5);
    await ctx.shootFindings(collector.raws, (r) => prefix(r.rule));

    ctx.budget(max * 0.35);
    await group(INTERACTIVE, true);
    await group(LAYOUT);
  } catch (e) {
    const msg = 'Page could not be tested: ' + (e as Error).message.split('\n')[0];
    ctx.data.errors.push(msg);
    run.log('    ! ' + msg);
  } finally {
    await context.close().catch(() => undefined);
  }

  const { findings, summary } = collector.finalize(url, title || url, config);
  if (ctx.data.errors.length && !title) summary.error = ctx.data.errors[0];
  if (summary.error) summary.wcagAA = null; // a page that could not be loaded is never reported as passing
  return {
    links, axeMeta: collector.axeMeta,
    result: {
      url, slug: ctx.slug, title, summary, findings, passes: collector.passes, ...ctx.data,
      ariaSnapshotFile: ariaFile, lighthouseScore: null, durationMs: Date.now() - started,
    },
  };
}
