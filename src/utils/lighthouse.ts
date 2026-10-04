import type { A11yConfig } from '../config';

/**
 * Optional Lighthouse accessibility score. Off by default.
 * To use it: npm install --save-dev lighthouse, then set lighthouse.enabled to true in the config.
 * Returns null when Lighthouse is not installed or fails; it never stops the run.
 */
export async function lighthouseScore(url: string, config: A11yConfig): Promise<number | null> {
  try {
    const name = 'lighthouse';
    const lighthouse = ((await import(name)) as { default: (u: string, o: Record<string, unknown>) => Promise<{ lhr: { categories: { accessibility: { score: number | null } } } } | undefined> }).default;
    const { chromium } = await import('playwright');
    const port = 9300 + Math.floor(Math.random() * 400);
    const browser = await chromium.launch({ args: [`--remote-debugging-port=${port}`] });
    try {
      const auth = config.auth.httpUsername ? { Authorization: 'Basic ' + Buffer.from(`${config.auth.httpUsername}:${config.auth.httpPassword || ''}`).toString('base64') } : undefined;
      const res = await lighthouse(url, { port, onlyCategories: ['accessibility'], output: 'json', logLevel: 'error', extraHeaders: auth });
      const score = res?.lhr.categories.accessibility.score;
      return typeof score === 'number' ? Math.round(score * 100) : null;
    } finally { await browser.close(); }
  } catch { return null; }
}
