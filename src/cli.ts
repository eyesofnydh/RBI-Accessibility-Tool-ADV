import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { loadConfig, parseArgs } from './config';
import { consoleSummary } from './reporters/console';
import { writeReports } from './reporters/index';
import { runAudit } from './run';

const HELP = `
RBI accessibility tester (WCAG 2.2 AA)

  npm run test:a11y  -- --url=https://example.com      test one page (plus "urls" from the config)
  npm run crawl:a11y -- --url=https://example.com      crawl the site and test every page found
  npm run report                                       open the dashboard
  npm start                                            start page in the browser: enter a URL and press Run

Options
  --url=URL            start page (or set TARGET_URL, or baseUrl in accessibility.config.ts)
  --pages=FILE         a text file with one page address per line; every page in it is tested
  --max-pages=N        crawl limit (default 50)
  --max-depth=N        crawl depth (default 3)
  --only=a,b           run only these tests, e.g. --only=contrast,keyboard
  --skip=a,b           skip these tests, e.g. --skip=zoom,axe
  --with=a,b           add optional tests that are off by default, e.g. --with=tables,lists
  --headed             show the browser while testing
  --browser=NAME       chromium (default), firefox or webkit
  --out=DIR            report folder (default "reports")
  --config=FILE        another config file

Login: put A11Y_HTTP_USERNAME and A11Y_HTTP_PASSWORD in a file named .env (never in the config file).
Exit code: 0 = no failures, 1 = WCAG failures found, 2 = the run itself broke.
`;

async function main(): Promise<void> {
  const [mode, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  if (args.help || (mode !== 'test' && mode !== 'crawl')) { console.log(HELP); process.exit(mode === 'test' || mode === 'crawl' || args.help ? 0 : 2); }
  const config = await loadConfig(args);
  const outDir = path.resolve(config.output.dir);
  mkdirSync(outDir, { recursive: true });

  console.log(`\nTesting ${config.baseUrl || '(no URL)'} against WCAG 2.2 AA (${mode === 'crawl' ? `crawl, up to ${config.crawl.maxPages} pages` : 'single page'})\n`);
  const run = await runAudit(config, mode as 'test' | 'crawl');
  const index = writeReports(run, outDir);
  console.log('\n' + consoleSummary(run, './' + path.relative(process.cwd(), index).split(path.sep).join('/')) + '\n');
  process.exit(run.totals.wcagAA === false ? 1 : 0);
}

main().catch((e: Error) => {
  console.error('\nThe run stopped: ' + e.message + '\n');
  process.exit(2);
});
