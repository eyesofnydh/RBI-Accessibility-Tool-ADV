import { PNG } from 'pngjs';

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Makes text safe for a file name. Example: slug('About Us / RBI') -> "about-us-rbi" */
export function slug(text: string, max = 40): string {
  return (text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max).replace(/-+$/, '') || 'item';
}

/** Short page name for file names. Example: pageSlug('https://x.org/about-us/history') -> "about-us-history" */
export function pageSlug(url: string): string {
  try {
    const u = new URL(url);
    const p = u.pathname.replace(/\/+$/, '');
    return slug((p || 'home') + (u.search ? '-' + u.search : ''), 50);
  } catch { return slug(url, 50); }
}

/** Share of pixels that differ between two PNG buffers (1 if the sizes differ). */
export function pixelDiff(a: Buffer, b: Buffer): number {
  const x = PNG.sync.read(a), y = PNG.sync.read(b);
  if (x.width !== y.width || x.height !== y.height) return 1;
  let diff = 0;
  for (let i = 0; i < x.data.length; i += 4) {
    if (Math.abs(x.data[i] - y.data[i]) > 16 || Math.abs(x.data[i + 1] - y.data[i + 1]) > 16 || Math.abs(x.data[i + 2] - y.data[i + 2]) > 16) diff++;
  }
  return diff / (x.data.length / 4);
}

export function csvCell(v: unknown, guard = false): string {
  let s = v === null || v === undefined ? '' : String(v);
  if (guard && /^[=+\-@]/.test(s)) s = "'" + s; // stop spreadsheets reading it as a formula
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
export function toCsv(head: string[], rows: unknown[][], guardFrom = 0): string {
  return '\uFEFF' + [head.join(',')].concat(rows.map((r) => r.map((c, i) => csvCell(c, i >= guardFrom && typeof c === 'string')).join(','))).join('\r\n');
}
export function escapeHtml(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
