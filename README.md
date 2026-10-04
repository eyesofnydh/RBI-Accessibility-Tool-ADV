# RBI accessibility tester

Automated and assisted accessibility testing for the RBI website and similar large sites, against **WCAG 2.2 Level AA**.

Every result is one of three values:

| Value | Meaning |
|---|---|
| `true` | PASS. The tool checked it and it passes. |
| `false` | FAIL. The tool checked it and it fails. |
| `null` | MANUAL_REVIEW. The tool cannot decide; the report says exactly what to check by hand. |

A `null` is never counted as a pass. A page with no failures but with open manual reviews gets `wcagAA: null`, not `true`.

## Setup (once)

You need [Node.js](https://nodejs.org) 20 or newer.

```bash
npm install
```

This also downloads the Chromium browser the tool drives.

For the staging site login, copy `.env.example` to `.env` and fill in the username and password. The password stays in that file on your machine; do not put it in the config file.

## Running

### With the start page (easiest)

```bash
npm start
```

Your browser opens a start page. Enter the page address, choose "This page only" or "Whole site", tick the tests you want, and press **Run test**. Progress is shown as it happens; when it finishes, press **Open the dashboard**. Leave the terminal window open while you test.

- "Stop after this page" ends a crawl early and still writes the report for the pages already tested.
- If no login is found in `.env`, you can type the site username and password on the start page. They are used for that run only and are not saved.
- The app only accepts connections from your own computer.

### From the command line

```bash
# One page
npm run test:a11y -- --url=https://stg-rbi.webc.in/regulated-entities

# The whole site (follows same-site links)
npm run crawl:a11y -- --url=https://stg-rbi.webc.in/ --max-pages=50

# Open the dashboard
npm run report
```

Useful options:

| Option | What it does |
|---|---|
| `--max-pages=N`, `--max-depth=N` | Crawl limits (defaults 50 and 3) |
| `--pages=pages.txt` | Test every address in a text file (one per line) |
| `--only=contrast,keyboard` | Run only these tests |
| `--skip=zoom,axe` | Skip these tests |
| `--headed` | Show the browser while it works |
| `--out=DIR` | Write the report somewhere else |

**Table markup and list markup are optional.** They are not run unless you tick "Table markup (optional)" or "List markup (optional)" on the start page, add `--with=tables,lists` on the command line, or set them to `true` in `accessibility.config.ts`. When they are off, axe-core's table and list rules are left out as well.

Test names for `--only`, `--skip` and `--with`: `contrast, keyboard, focus, headings, images, links, aria, responsive, zoom, textSpacing, forcedColors, openedContent, hoverContent, formErrors, forms, tables, lists, modals, landmarks, dynamicContent, carousel, screenReader, page, axe, colorInventory`.

On the small sample pages a full run takes 10 to 60 seconds per page; large pages will take longer. Use `--only` while working on one kind of issue.

## What you get

```text
reports/
  index.html                  dashboard (opens by double-click too)
  accessibility-report.json   everything, for other tools
  accessibility-report.csv    one row per issue, ready for the bug sheet
  issue-groups.csv            each distinct issue once, with the pages it appears on
  accessibility-report.md     readable summary
  contrast-report.csv         every element checked for contrast, passes included
  color-inventory.csv         every colour found in the CSS and how it is used
  links.csv                   every link, marked internal or external
  keyboard-focus-order.csv    the Tab path of each page
  accessibility-tree/         accessibility tree snapshot per page
  screenshots/                issue screenshots, plus 100-percent/ 200-percent/ 400-percent/
```

Each issue has an ID, a bug sentence you can paste into the bug sheet, steps to reproduce, actual and expected result, WCAG criterion and level, severity, selector, XPath, HTML, computed CSS, a screenshot with the element outlined, and a suggested fix. The dashboard's "Copy bug report" button copies all of it.

## What is tested

| Area | Automatic checks | Left for you (shown as `null`) |
|---|---|---|
| Colour contrast | Text, placeholders, field values, field borders, restyled checkboxes and radios, SVG and icon-font icons, CSS-generated text, links inside sentences, borders of buttons and other controls. Colours come from computed CSS. | Text over photos, images or mixed gradients; hover and selected colours; pale borders on cards, tables and dividers |
| Keyboard | Full Tab path, traps, focus landing on hidden or covered elements, Shift+Tab, clickable elements that cannot take focus, arrow keys on tab lists and menus, Enter/Space on expandable controls | Backward jumps in focus order, positive tabindex |
| Focus | Missing indicator (CSS compared before and after focus, then confirmed by screenshot comparison), indicator contrast below 3:1, focus hidden behind sticky bars | Indicators that are only a colour change |
| Responsive (360x256, 320x256) | Horizontal scrolling, text cut off, controls off-screen | Overlaps, content that disappears, sticky bars covering the screen, small targets |
| Zoom (100%, 200%, 400%) | Text clipped at 200%, reflow at 400% | Horizontal scrolling at 200%, overlaps |
| Headings, lists, tables | Empty headings, typed bullets, tables without headers, layout tables with header markup, complex tables without scope, broken `headers` | Text that only looks like a heading or list |
| Images | Missing alt, file-name alt, unnamed `role="img"` SVG | Whether alt text is a good description, decorative images with alt, charts without a long description |
| Names, links, ARIA, forms | Missing accessible names, label not in name, generic link text with no context, broken ARIA references, focusable content inside `aria-hidden`, roles without keyboard support, unlabelled fields, ungrouped radio buttons | Generic link text with context, placeholder-only labels, checkbox grouping |
| Text spacing (1.4.12) | Text cut off after line, letter, word and paragraph spacing are increased to the WCAG values | Overlaps |
| Hidden content | Opens menus, accordions, dropdowns and tabs (two levels deep) and runs the contrast, name, link, image and form checks on what appears | Anything beyond the per-page limit |
| Hover and focus colours | Text contrast with `:hover` and `:focus` forced on each link and button | States set by scripts rather than CSS |
| Tooltips (1.4.13) | Can be dismissed with Escape, can be hovered, stays visible | Tooltips that are not marked up as tooltips |
| Form errors (3.3.1) | Submits each form empty with all data-carrying requests blocked, then checks the errors are tied to fields or announced | Wrong-value errors; forms that show no error |
| Windows High Contrast | Focus indicator still visible with forced colours; full-page screenshot | Everything else in the screenshot |
| Modals | Missing name, focus not moving in, focus escaping to the background, focus not returning | Escape behaviour, background still readable |
| Dynamic content | Search results and pagination that update with no live region and no focus move; pagination without `aria-current` | Pages with filters and no live region |
| Page | Missing title, missing or invalid `lang`, Hindi text without `lang`, duplicate ids used by labels | Generic, repeated or mismatched titles; videos without a captions track; media that autoplays with sound |
| axe-core | All WCAG 2.0, 2.1 and 2.2 A/AA rules plus best practices. Duplicates of the custom checks are removed. | axe "incomplete" results |

### 200% zoom and 360x256

- **200% zoom** is tested at half the width and height of `desktopViewport` (default 1920x945, so 960x472) at double pixel density. That is what Chrome does when you press Ctrl and +. Change `desktopViewport` in the config if your screen is a different size.
- **360x256 and 320x256** are tested the same way as the DevTools device toolbar.
- At each size the tool scrolls the whole page, saves a screenshot of every screenful, and checks the full page length for the layout problems above.
- **400%** uses 320x256, which is the WCAG reflow condition.

### External links

Every link is classed as internal or external (set `site.internalHosts` in the config for other RBI domains that count as internal). For external and new-tab links the tool checks whether the accessible name or description says so. `links.csv` and the dashboard's Links tab list them all. What JAWS actually says is on the manual checklist.

### Contrast and WebAIM

The ratio uses the WCAG formula, the same one as the [WebAIM contrast checker](https://webaim.org/resources/contrastchecker/). Every contrast row has a "Check" link that opens WebAIM with the same two colours.

One difference in how the number is shown: this tool cuts the ratio to two decimals and never rounds up, so a failing 4.478 is shown as 4.47. WebAIM shows the same pair as 4.48. Pass or fail is decided on the exact value.

### The same issue on many pages

A problem in the header or footer shows up on every page. The Issues tab therefore opens on "Each distinct issue once": one row per issue, with the number of pages it appears on. Switch "Show" to "Every occurrence" to see them all. `issue-groups.csv` is the grouped list and `accessibility-report.csv` is the full one; the console summary prints both counts.

### Borders

Every visible border is measured the same way as text: the border colour is the foreground, and the colour next to it is the background. The background is whichever side gives the better ratio, the colour outside the element or the element's own fill. The required ratio is 3:1, the "Graphical Objects and User Interface Components" line in WebAIM. Borders appear in the Color contrast tab and in `contrast-report.csv` as "Border" (cards, panels, tables, dividers) or "Border (control)" (buttons, links, tabs). Identical borders are listed once with a count.

- A form field whose border and fill are both below 3:1 is a WCAG failure (1.4.11).
- A button or link whose border is below 3:1 is reported as an RBI project-rule failure. WCAG requires 3:1 there only when the border is the only thing that identifies the control.
- A card, table or divider border below 3:1 shows `false` in the contrast table and is listed as MANUAL_REVIEW in the issues: it is a failure only if the border carries meaning.

Set `contrast: { borders: false }` in the config to switch border rows off.

## Three kinds of result level

- **A / AA**: a WCAG 2.2 criterion. These decide the "Overall WCAG AA" verdict.
- **Project**: an RBI audit expectation that WCAG does not strictly require, such as table captions, skipped heading levels, `aria-current` in breadcrumbs, underline on focused links, and announcing external links. Reported, counted separately, and not part of the WCAG verdict.
- **Best practice**: good practice only (for example a missing `<main>` landmark).

To make project rules fail the overall verdict too, set `rbi.projectRulesAffectVerdict: true` in the config.

## What this tool cannot do

- It does not listen to a screen reader. Where markup is right it reports "Programmatic accessibility markup: PASS" and leaves the announcement as MANUAL_REVIEW. The "Manual checks" tab is the list to work through with JAWS.
- It opens at most `limits.maxOpenStates` (12) menus, accordions and tabs per page, two levels deep. A note on the Overview tab says how many were found and how many were opened; the rest is a manual check.
- It submits forms empty only. Errors for wrong values are a manual check. While it does this, every request that carries data is blocked, so nothing reaches the server.
- Hover and focus colours are measured by forcing the CSS state. Colours changed by scripts on hover are not seen.
- Date pickers are tested only as ordinary buttons; there is no dedicated date-picker test.
- It does not drive NVDA or JAWS.
- Heuristic checks (visual headings, list-like content, decorative or complex images, overlaps) are always MANUAL_REVIEW, never FAIL.
- Firefox and WebKit run everything except the click-handler check, which needs Chromium. Only Chromium has been tested.
- The optional Lighthouse score (`lighthouse.enabled`, after `npm install --save-dev lighthouse`) is included but has not been tested.

## Settings

Edit `accessibility.config.ts`. Every option and its default is documented in `src/config.ts`. The ones you are most likely to need:

```ts
desktopViewport: { width: 1920, height: 945 },   // your screen at 100%
viewports: [{ width: 360, height: 256 }, { width: 320, height: 256 }],
zoomLevels: [1, 2],
optionalReflow400: true,
site: { internalHosts: ['rbi.org.in'] },
search: { enabled: true, query: 'bank' },         // set input: '<css selector>' if it picks the wrong field
modals: { triggers: [{ name: 'Leaving RBI popup', open: '<css selector of the control>' }] },
crawl: { maxPages: 50, maxDepth: 3, include: [], exclude: ['logout'] },
limits: { maxTabStops: 150, maxScreenshotsPerPage: 60, maxFindingsPerRule: 40, maxOpenStates: 12, maxOpenDepth: 2 },
contrast: { borders: true, states: true },       // states = hover and focus colours
```

## How it is built

```text
src/
  cli.ts            command line
  app.ts            "npm start": start page, run/stop API and the dashboard
  ui/               start page script and styles
  run.ts            the run: crawl loop, totals, verdict
  runner.ts         one page: which scanners run, in which order
  context.ts        browser setup, login, screenshots, bridge to the in-page code
  pipeline.ts       de-duplication, noise caps, bug sentences
  checklist.ts      manual checklist
  config.ts         all settings and defaults
  types.ts          shared types
  wcag/             criteria table and the rule registry (one entry per issue type)
  scanners/         one file per test area: what to run and which keys to press
  browser/          the code that runs inside the page and inspects the DOM and CSS
  crawler/          URL normalising and the page queue
  reporters/        HTML dashboard, JSON, CSV, Markdown, console summary
tests/              unit tests and an end-to-end test against local sample pages
```

`src/browser` is bundled with esbuild at start-up and injected into every page as `window.__a11y`.

### Adding a rule

1. Add an entry to `src/wcag/rules.ts` (id, WCAG criterion, category, severity, issue title, expected result, fix, why it is raised, and optionally a bug-sentence template, the RBI regression sentence and a manual-check instruction).
2. In the matching file in `src/browser/`, call `fail('your.rule', element, 'what was found')`, `review(...)` for a manual check, or `pass('your.rule')`.
3. Add a planted example to `tests/fixtures/bad.html` and the rule id to `tests/integration.test.ts`.

### Adding a scanner

Write it in `src/scanners/`, add its on/off switch to `tests` in `src/config.ts`, and add it to one of the three lists in `src/runner.ts`.

## Checking the tool itself

```bash
npm run selftest  # the same as npm test
npm test          # unit tests plus an end-to-end run against tests/fixtures
npm run typecheck
```

`tests/fixtures/bad.html` contains one planted example of each problem; the test fails if any expected rule stops firing. `tests/fixtures/good.html` is a clean page; the test fails if any WCAG failure is reported on it.
