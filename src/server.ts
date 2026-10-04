import { exec } from 'node:child_process';
import { createReadStream, existsSync, statSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { parseArgs } from './config';

/** "npm run report": serves the report folder on localhost and opens the dashboard. */
const args = parseArgs(process.argv.slice(2));
const root = path.resolve(args.out || 'reports');
const port = Number(args.port || process.env.PORT || 4173);
const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.csv': 'text/csv; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.png': 'image/png', '.yml': 'text/plain; charset=utf-8' };

if (!existsSync(path.join(root, 'index.html'))) {
  console.error(`No report found in ${root}. Run "npm run test:a11y -- --url=https://example.com" first.`);
  process.exit(1);
}
http.createServer((req, res) => {
  const rel = decodeURIComponent((req.url || '/').split('?')[0]);
  const file = path.normalize(path.join(root, rel === '/' ? 'index.html' : rel));
  if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404).end('Not found'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1', () => {
  const url = `http://localhost:${port}/`;
  console.log(`Accessibility dashboard: ${url}\nPress Ctrl+C to stop.`);
  if (!args['no-open']) {
    const cmd = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
    exec(cmd, () => undefined);
  }
});
