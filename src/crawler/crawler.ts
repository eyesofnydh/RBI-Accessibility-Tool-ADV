import type { A11yConfig } from '../config';

/**
 * Cleans a link so the same page is never queued twice. Returns null for links that must not be visited.
 * Example: normalizeUrl('/about-us/?utm_source=x#top', 'https://site.org/', cfg) -> "https://site.org/about-us"
 */
export function normalizeUrl(raw: string, base: string, cfg: A11yConfig['crawl']): string | null {
  let u: URL;
  try { u = new URL(raw, base); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null; // mailto:, tel:, javascript:
  u.hash = '';
  u.hostname = u.hostname.toLowerCase();
  const ext = (u.pathname.split('.').pop() || '').toLowerCase();
  if (cfg.skipDownloads && u.pathname.includes('.') && cfg.downloadExtensions.includes(ext)) return null;
  const params = [...u.searchParams.entries()].filter(([k]) => !cfg.ignoreQueryParams.includes(k.toLowerCase())).sort(([a], [b]) => a.localeCompare(b));
  u.search = '';
  for (const [k, v] of params) u.searchParams.append(k, v);
  if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, '');
  return u.toString();
}

const host = (h: string) => h.replace(/^www\./, '');

/** The queue of pages to visit: same-origin only, breadth first, with depth, include/exclude and query-string limits. */
export class Frontier {
  private queue: { url: string; depth: number }[] = [];
  private seen = new Set<string>();
  private variants = new Map<string, number>();
  private origin: URL;
  private include: RegExp[];
  private exclude: RegExp[];

  constructor(start: string, private cfg: A11yConfig['crawl'], extra: string[] = []) {
    this.origin = new URL(start);
    this.include = cfg.include.map((p) => new RegExp(p, 'i'));
    this.exclude = cfg.exclude.map((p) => new RegExp(p, 'i'));
    this.push(start, 0, true);
    extra.forEach((u) => this.push(u, 0, true));
  }

  private push(raw: string, depth: number, force = false): void {
    const url = normalizeUrl(raw, this.origin.href, this.cfg);
    if (!url) return;
    const u = new URL(url);
    const key = url.replace('://www.', '://'); // www and non-www are the same page
    if (this.seen.has(key)) return;
    if (host(u.hostname) !== host(this.origin.hostname)) return; // external domain
    if (!force) {
      if (depth > this.cfg.maxDepth) return;
      if (this.exclude.some((r) => r.test(url))) return;
      if (this.include.length && !this.include.some((r) => r.test(url))) return;
      if (u.search) {
        // Stop endless filter and paging combinations: only a few query variants per path.
        const n = this.variants.get(u.pathname) || 0;
        if (n >= this.cfg.maxQueryVariantsPerPath) return;
        this.variants.set(u.pathname, n + 1);
      }
    }
    this.seen.add(key);
    this.queue.push({ url, depth });
  }

  add(links: string[], fromDepth: number): void { links.forEach((l) => this.push(l, fromDepth + 1)); }
  next(): { url: string; depth: number } | undefined { return this.queue.shift(); }
  get pending(): number { return this.queue.length; }
}
