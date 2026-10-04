import { defineConfig } from './src/config';

/**
 * Settings for the accessibility run. Everything here is optional; see src/config.ts for all options and defaults.
 *
 * The site password is NOT kept in this file. Put it in a file named .env next to package.json:
 *   A11Y_HTTP_USERNAME=your-user
 *   A11Y_HTTP_PASSWORD=your-password
 */
export default defineConfig({
  baseUrl: process.env.TARGET_URL,
  standard: 'WCAG22AA',

  // Your screen at 100% zoom. 200% zoom is tested at half this width, exactly like Ctrl + in Chrome.
  desktopViewport: { width: 1920, height: 945 },

  viewports: [
    { width: 360, height: 256 },
    { width: 320, height: 256 },
  ],

  zoomLevels: [1, 2],
  optionalReflow400: true,

  tests: {
    contrast: true,
    keyboard: true,
    focus: true,
    headings: true,
    images: true,
    links: true,
    aria: true,
    responsive: true,
    zoom: true,
    forms: true,
    // Optional tests: switched off by default. Tick them on the start page, or set them to true here, when needed.
    tables: false,
    lists: false,
    modals: true,
    landmarks: true,
    dynamicContent: true,
    carousel: true,
    screenReader: true,
    page: true,
    axe: true,
    colorInventory: true,
    textSpacing: true,     // WCAG 1.4.12
    forcedColors: true,    // Windows High Contrast
    openedContent: true,   // opens menus, accordions and tabs and tests what was hidden
    hoverContent: true,    // tooltips (WCAG 1.4.13)
    formErrors: true,      // submits forms empty; data-carrying requests are blocked
  },

  crawl: {
    maxPages: 50,
    maxDepth: 3,
    include: [],
    exclude: ['logout', 'signout'],
  },

  // Search test: the tool finds the search box by itself. Set "input" to a CSS selector if it picks the wrong one.
  search: { enabled: true, query: 'bank' },

  // Modal test: list controls that open a dialog. Controls with aria-haspopup="dialog" are found automatically.
  modals: {
    autoDetect: true,
    triggers: [
      // { name: 'Leaving RBI popup', open: 'footer a[target="_blank"]' },
    ],
  },

  // Screen reader named in the manual checklist.
  manual: { screenReader: 'JAWS + Chrome' },

  // Hosts that count as internal (the page's own host always does).
  site: { internalHosts: ['rbi.org.in'] },

  rbi: {
    linkFocusUnderlineAndColor: true,
    projectRulesAffectVerdict: false,
  },
});
