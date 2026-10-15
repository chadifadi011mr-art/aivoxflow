// AIVOXFLOW test suite — plain Node, no dependencies.
// Usage: node tests/run.mjs
// Covers: build integrity, routes, internal links, HTML/a11y structure,
// contrast tokens, search index, sitemap/canonical modes, HTTP status
// codes, JS budget, content honesty fields.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(root, '..');
const dist = path.join(repo, 'dist');
let failures = 0;
let checks = 0;

const ok = (name, cond, detail = '') => {
  checks++;
  if (cond) { console.log(`PASS  ${name}`); }
  else { failures++; console.log(`FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
};

const walk = (dir, out = []) => {
  for (const f of readdirSync(dir)) {
    const full = path.join(dir, f);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
};

// ------------------------------------------------------------ 1. build
if (!existsSync(dist)) {
  console.log('dist/ missing — running build first...');
  execFileSync(process.execPath, [path.join(repo, 'site', 'build.mjs')], { stdio: 'inherit', cwd: repo });
}
ok('build output exists (dist/)', existsSync(dist));

const htmlFiles = walk(dist).filter((f) => f.endsWith('.html'));
ok('HTML pages generated (>= 20)', htmlFiles.length >= 20, `found ${htmlFiles.length}`);

// ------------------------------------------------------------ 2. routes
const expected = [
  '/index.html', '/404.html', '/articles/index.html',
  '/articles/page/2/index.html', '/tools/index.html', '/search/index.html',
  '/about/index.html', '/contact/index.html', '/privacy/index.html',
  '/editorial-policy/index.html', '/corrections/index.html',
  '/affiliate-disclosure/index.html', '/terms/index.html',
  '/category/ai-tools/index.html', '/category/tutorials/index.html',
  '/category/software-web/index.html', '/category/automation-agents/index.html',
  '/category/ai-news/index.html', '/category/comparisons/index.html',
  '/assets/css/site.css', '/assets/js/site.js', '/assets/favicon.svg',
  '/assets/search-index.json', '/assets/site.webmanifest',
];
for (const r of expected) ok(`route ${r}`, existsSync(path.join(dist, r)));

const articleDirs = readdirSync(path.join(dist, 'articles')).filter((d) =>
  d !== 'page' && statSync(path.join(dist, 'articles', d)).isDirectory());
ok('6 article pages', articleDirs.length === 6, `found ${articleDirs.length}`);

// ------------------------------------------------------------ 3. links
const files = htmlFiles.map((f) => ({ file: f, rel: '/' + path.relative(dist, f).replace(/\\/g, '/') }));
let badLinks = [];
let extLinks = 0;
let anchorsOk = true;
const resolve = (href) => {
  const clean = href.split('#')[0].split('?')[0];
  if (clean === '') return true; // pure hash handled separately
  const target = clean.startsWith('/') ? path.join(dist, clean) : path.resolve(path.dirname(dist + '/x'), clean);
  const asIndex = clean.endsWith('/') ? path.join(target, 'index.html') : target;
  return existsSync(asIndex) || existsSync(target);
};
for (const { file, rel } of files) {
  const html = readFileSync(file, 'utf8');
  const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
  for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const url = m[1];
    if (/^(https?:)?\/\//.test(url)) { extLinks++; continue; }
    if (url.startsWith('#')) {
      if (url.length > 1 && !ids.has(url.slice(1))) { anchorsOk = false; badLinks.push(`${rel} → ${url} (missing id)`); }
      continue;
    }
    if (!resolve(url)) badLinks.push(`${rel} → ${url}`);
  }
}
ok('all internal links/srcs resolve', badLinks.length === 0, badLinks.slice(0, 5).join('; '));
ok('same-page anchors resolve', anchorsOk, badLinks.filter((b) => b.includes('#')).slice(0, 3).join('; '));
console.log(`INFO  ${extLinks} external links (not fetched in tests)`);

// ------------------------------------------------------------ 4. HTML/a11y structure
let structIssues = [];
for (const { file, rel } of files) {
  const html = readFileSync(file, 'utf8');
  const need = (cond, msg) => { if (!cond) structIssues.push(`${rel}: ${msg}`); };
  need(/<!doctype html>/i.test(html), 'missing doctype');
  need(/<html lang="en">/.test(html), 'missing lang=en');
  need(/<meta name="viewport"/.test(html), 'missing viewport');
  need(/<title>[^<]+<\/title>/.test(html), 'missing title');
  need(/<meta name="description" content="[^"]{20,}"/.test(html), 'missing/short description');
  need((html.match(/<h1[\s>]/g) || []).length === 1, 'must have exactly one h1');
  need(html.includes('class="skip-link"'), 'missing skip link');
  need(!/href="#"(?!main)/.test(html), 'empty href="#" link');
  for (const img of html.matchAll(/<img\b[^>]*>/g)) {
    need(/\balt="/.test(img[0]), `img without alt: ${img[0].slice(0, 60)}`);
    need(/\bwidth="/.test(img[0]) && /\bheight="/.test(img[0]), 'img without width/height');
  }
  for (const inp of html.matchAll(/<(input|select|textarea)\b[^>]*id="([^"]+)"[^>]*>/g)) {
    need(html.includes(`for="${inp[2]}"`), `form control #${inp[2]} has no label`);
  }
  need(!/<script src="https?:\/\//.test(html), 'external script detected');
  need(!/<link rel="stylesheet" href="https?:\/\//.test(html), 'external stylesheet detected');
  for (const ld of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { JSON.parse(ld[1]); } catch (e) { need(false, `invalid JSON-LD: ${e.message}`); }
  }
}
ok('HTML structure + accessibility basics', structIssues.length === 0, structIssues.slice(0, 6).join(' | '));

// ------------------------------------------------------------ 5. contrast from tokens
const tokens = readFileSync(path.join(repo, 'brand', 'tokens.css'), 'utf8');
const tok = (name) => (tokens.match(new RegExp(`--ax-${name}:\\s*(#[0-9a-fA-F]{6})`)) || [])[1];
const lum = (hex) => {
  const ch = (v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const h = hex.slice(1);
  const [r, g, b] = [0, 2, 4].map((i) => ch(parseInt(h.slice(i, i + 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const cr = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const pairs = [
  ['gray-900', 'white', 4.5, true], ['gray-600', 'white', 4.5, true],
  ['electric-600', 'white', 4.5, true], ['white', 'electric-500', 4.5, true],
  ['white', 'navy-900', 4.5, true], ['white', 'navy-800', 4.5, true],
  ['electric-400', 'navy-900', 4.5, true], ['gray-400', 'navy-900', 4.5, true],
  ['electric-500', 'navy-900', 4.5, false], // documented FAIL: not for text on navy
];
for (const [fg, bg, min, shouldPass] of pairs) {
  const a = tok(fg), b = tok(bg);
  const ratio = a && b ? cr(a, b) : 0;
  ok(`contrast ${fg} on ${bg} ${shouldPass ? '>= AA' : 'confirmed FAIL (<4.5) for docs'}`,
    shouldPass ? ratio >= min : ratio < min, ratio ? `${ratio.toFixed(2)}:1` : 'token missing');
}

// ------------------------------------------------------------ 6. search index
const idx = JSON.parse(readFileSync(path.join(dist, 'assets', 'search-index.json'), 'utf8'));
const articleJson = readdirSync(path.join(repo, 'site', 'data', 'articles')).map((f) =>
  JSON.parse(readFileSync(path.join(repo, 'site', 'data', 'articles', f), 'utf8')));
ok('search index covers all articles', idx.length === articleJson.length, `${idx.length} vs ${articleJson.length}`);
ok('search index entries have title+url', idx.every((e) => e.t && e.u && e.u.startsWith('/')));

// ------------------------------------------------------------ 7. content honesty fields
let honesty = [];
for (const a of articleJson) {
  if (!a.disclosure) honesty.push(`${a.slug}: missing disclosure`);
  if (a.author !== 'AIVOXFLOW Editorial') honesty.push(`${a.slug}: unexpected author`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a.published)) honesty.push(`${a.slug}: bad date`);
}
ok('articles carry disclosure + editorial byline + ISO dates', honesty.length === 0, honesty.join('; '));

// ------------------------------------------------------------ 8. sitemap/canonical modes
ok('no sitemap/robots without SITE_URL',
  !existsSync(path.join(dist, 'sitemap.xml')) && !existsSync(path.join(dist, 'robots.txt')));
ok('no canonical tag without SITE_URL', !files.some(({ file }) => /rel="canonical"/.test(readFileSync(file, 'utf8'))));

execFileSync(process.execPath, [path.join(repo, 'site', 'build.mjs')], {
  stdio: 'pipe', cwd: repo,
  env: { ...process.env, AIVOXFLOW_SITE_URL: 'https://aivoxflow.example' },
});
const sm = existsSync(path.join(dist, 'sitemap.xml')) ? readFileSync(path.join(dist, 'sitemap.xml'), 'utf8') : '';
const robots = existsSync(path.join(dist, 'robots.txt')) ? readFileSync(path.join(dist, 'robots.txt'), 'utf8') : '';
ok('sitemap generated with SITE_URL', sm.startsWith('<?xml') && sm.includes('https://aivoxflow.example/articles/'));
ok('sitemap has one entry per route', (sm.match(/<url>/g) || []).length >= 20, `${(sm.match(/<url>/g) || []).length} urls`);
ok('robots points at sitemap', robots.includes('Sitemap: https://aivoxflow.example/sitemap.xml'));
ok('canonical emitted with SITE_URL', /rel="canonical" href="https:\/\/aivoxflow\.example\//.test(readFileSync(path.join(dist, 'index.html'), 'utf8')));
// restore default build (no URL)
execFileSync(process.execPath, [path.join(repo, 'site', 'build.mjs')], { stdio: 'pipe', cwd: repo });

// ------------------------------------------------------------ 9. HTTP status codes
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  let file = path.join(dist, url);
  if (url.endsWith('/')) file = path.join(file, 'index.html');
  if (existsSync(file) && statSync(file).isFile()) {
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(readFileSync(file));
  } else if (existsSync(file + '.html')) {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(readFileSync(file + '.html'));
  } else {
    res.writeHead(404, { 'content-type': 'text/html' });
    res.end(readFileSync(path.join(dist, '404.html')));
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
let httpIssues = [];
for (const { rel } of files.filter((f) => f.rel !== '/404.html')) {
  const url = rel.endsWith('/index.html') ? rel.replace(/index\.html$/, '') : rel;
  const res = await fetch(`http://127.0.0.1:${port}${url}`);
  if (res.status !== 200) httpIssues.push(`${url} → ${res.status}`);
}
const missing = await fetch(`http://127.0.0.1:${port}/definitely-not-here/`);
ok('all routes return HTTP 200', httpIssues.length === 0, httpIssues.slice(0, 5).join('; '));
ok('unknown route returns HTTP 404', missing.status === 404, `got ${missing.status}`);
const cssRes = await fetch(`http://127.0.0.1:${port}/assets/css/site.css`);
ok('stylesheet serves with css content-type', (cssRes.headers.get('content-type') || '').includes('text/css'));
server.close();

// ------------------------------------------------------------ 10. budgets
const jsSize = statSync(path.join(dist, 'assets', 'js', 'site.js')).size;
ok('JS budget < 5 KB', jsSize < 5120, `${jsSize} bytes`);
const cssSize = statSync(path.join(dist, 'assets', 'css', 'site.css')).size;
ok('CSS < 40 KB', cssSize < 40 * 1024, `${cssSize} bytes`);

// ------------------------------------------------------------ summary
console.log(`\n${checks - failures}/${checks} checks passed${failures ? ` — ${failures} FAILED` : ''}`);
if (failures) process.exit(1);
