// AIVOXFLOW preview server — zero-dependency static server for dist/.
// Usage: node site/serve.mjs [port]   (default 8130)
// Why not `python -m http.server`: (1) it serves its own default 404 page
// instead of dist/404.html, so HTTP status behavior cannot be previewed;
// (2) its CWD sitting inside dist/ blocks rebuilds on Windows (EPERM).
// This server runs with CWD outside dist/ and mirrors static-host behavior:
// directory URLs → index.html, missing routes → 404.html with status 404.
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(repo, 'dist');
const port = Number(process.argv[2] || 8130);
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
};

createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  let file = path.join(dist, url);
  if (url.endsWith('/')) file = path.join(file, 'index.html');
  // Never serve anything outside dist/ — path.join alone lets "../" escape.
  const inside = path.resolve(file).startsWith(path.resolve(dist) + path.sep);
  if (!inside) {
    res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }
  if (existsSync(file) && statSync(file).isFile()) {
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(readFileSync(file));
  } else {
    res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
    res.end(readFileSync(path.join(dist, '404.html')));
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`AIVOXFLOW preview: http://127.0.0.1:${port}/  (serves dist/ with real 404s)`);
});
