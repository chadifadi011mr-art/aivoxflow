// AIVOXFLOW test suite — plain Node, no dependencies.
// Usage: node tests/run.mjs
// Covers: build integrity, routes, internal links, HTML/a11y structure,
// contrast tokens, search index, sitemap/canonical/feed modes, HTTP status
// codes, budgets, structured data, social cards, and the atomic publish step.
import { readFileSync, readdirSync, existsSync, statSync, writeFileSync, rmSync } from 'node:fs';
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

const build = (env = {}) => execFileSync(process.execPath, [path.join(repo, 'site', 'build.mjs')], {
  stdio: 'pipe', cwd: repo, env: { ...process.env, ...env }, encoding: 'utf8',
});

// ------------------------------------------------------------ 1. build
// Always rebuild: the suite must be deterministic and independent of whatever
// state a previous run (or a manual URL build) left in dist/.
build();
ok('build output exists (dist/)', existsSync(dist));
ok('atomic build leaves no dist.tmp behind', !existsSync(path.join(repo, 'dist.tmp')));

// Search-engine ownership files (google<token>.html) are one-line verification
// tokens served verbatim to search engines — not site pages — so the page
// checks (structure, links, a11y) skip them by design.
const htmlFiles = walk(dist).filter((f) => f.endsWith('.html') && !/^google[0-9a-f]+\.html$/i.test(path.basename(f)));
ok('HTML pages generated (>= 22)', htmlFiles.length >= 22, `found ${htmlFiles.length}`);

// ------------------------------------------------------------ 2. routes
const cssFile = readdirSync(path.join(dist, 'assets', 'css')).find((f) => /^site\.[0-9a-f]{10}\.css$/.test(f));
const jsFile = readdirSync(path.join(dist, 'assets', 'js')).find((f) => /^site\.[0-9a-f]{10}\.js$/.test(f));
ok('css is content-fingerprinted', Boolean(cssFile), cssFile || 'no hashed css');
ok('js is content-fingerprinted', Boolean(jsFile), jsFile || 'no hashed js');

const expected = [
  '/index.html', '/404.html', '/articles/index.html',
  '/articles/page/2/index.html', '/tools/index.html', '/search/index.html',
  '/about/index.html', '/contact/index.html', '/privacy/index.html',
  '/editorial-policy/index.html', '/corrections/index.html',
  '/affiliate-disclosure/index.html', '/terms/index.html',
  '/authors/editorial/index.html', '/newsletter/index.html',
  '/category/ai-tools/index.html', '/category/tutorials/index.html',
  '/category/software-web/index.html', '/category/automation-agents/index.html',
  '/category/ai-news/index.html', '/category/comparisons/index.html',
  '/assets/favicon.svg', '/assets/search-index.json', '/assets/site.webmanifest',
  '/_headers',
];
for (const r of expected) ok(`route ${r}`, existsSync(path.join(dist, r)));

// Search Console ownership files (site/google<token>.html) must survive every
// build: deleting one silently drops site verification in Search Console.
const ownershipFiles = readdirSync(dist).filter((f) => /^google[0-9a-f]+\.html$/i.test(f));
ok('search ownership file copied to dist root', ownershipFiles.length >= 1, ownershipFiles.join(', ') || 'none found');

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
  need(/<html lang="en" dir="ltr">/.test(html), 'missing lang/dir');
  need(/<meta name="viewport"/.test(html), 'missing viewport');
  need(/<title>[^<]+<\/title>/.test(html), 'missing title');
  need(/<meta name="description" content="[^"]{20,}"/.test(html), 'missing/short description');
  need((html.match(/<h1[\s>]/g) || []).length === 1, 'must have exactly one h1');
  need(html.includes('class="skip-link"'), 'missing skip link');
  need(!/href="#"(?!main)/.test(html), 'empty href="#" link');
  need(!/style="/.test(html.replace(/<svg[\s\S]*?<\/svg>/g, '')), 'inline style attribute found (CSP-unfriendly)');
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
ok('search index carries category slug for filtering', idx.every((e) => e.g && e.c));
ok('search page is noindex', /<meta name="robots" content="noindex, follow">/.test(
  readFileSync(path.join(dist, 'search', 'index.html'), 'utf8')));

// ------------------------------------------------------------ 7. content honesty fields
let honesty = [];
for (const a of articleJson) {
  if (!a.disclosure) honesty.push(`${a.slug}: missing disclosure`);
  if (a.author !== 'AIVOXFLOW Editorial') honesty.push(`${a.slug}: unexpected author`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a.published)) honesty.push(`${a.slug}: bad date`);
  if (!Array.isArray(a.tags) || a.tags.length < 2) honesty.push(`${a.slug}: needs >= 2 tags`);
}
ok('articles carry disclosure + editorial byline + ISO dates + tags', honesty.length === 0, honesty.join('; '));

// ------------------------------------------------------------ 8. social cards
const artHtml = readFileSync(path.join(dist, 'articles', 'choose-an-ai-writing-tool', 'index.html'), 'utf8');
const ogPath = path.join(dist, 'assets', 'og');
ok('social cards are shipped', existsSync(ogPath) && readdirSync(ogPath).length >= 7,
  existsSync(ogPath) ? `${readdirSync(ogPath).length} files` : 'missing');
for (const slug of articleJson.map((a) => a.slug)) {
  ok(`og card for ${slug}`, existsSync(path.join(ogPath, `${slug}.png`)));
}
ok('article declares og:image + twitter:card=summary_large_image',
  /og:image" content="[^"]+\.png"/.test(artHtml) && /twitter:card" content="summary_large_image"/.test(artHtml));
ok('og:image has width/height/alt', /og:image:width" content="1200"/.test(artHtml)
  && /og:image:height" content="630"/.test(artHtml) && /og:image:alt"/.test(artHtml));

// ------------------------------------------------------------ 8b. article artwork + AI discovery
ok('article hero rendered with intrinsic dimensions',
  /<figure class="article-hero">[\s\S]{0,400}width="1600" height="900"/.test(artHtml));
ok('hero image file exists in the build',
  existsSync(path.join(dist, 'assets', 'articles', 'choose-an-ai-writing-tool', 'hero.jpg')));
ok('llms.txt is published', existsSync(path.join(dist, 'llms.txt')));
const llms = existsSync(path.join(dist, 'llms.txt')) ? readFileSync(path.join(dist, 'llms.txt'), 'utf8') : '';
ok('llms.txt lists every article', articleJson.every((a) => llms.includes(a.title)));
ok('llms-full.txt carries article text', (() => {
  const f = path.join(dist, 'llms-full.txt');
  if (!existsSync(f)) return false;
  const t = readFileSync(f, 'utf8');
  return articleJson.every((a) => t.includes(a.title) && t.includes(`/articles/${a.slug}/`));
})());

// ------------------------------------------------------------ 10. sitemap/canonical modes
ok('no sitemap/robots without SITE_URL',
  !existsSync(path.join(dist, 'sitemap.xml')) && !existsSync(path.join(dist, 'robots.txt')));
ok('no feed without SITE_URL',
  !existsSync(path.join(dist, 'feed.xml')) && !existsSync(path.join(dist, 'feed.json')));
ok('no canonical tag without SITE_URL', !files.some(({ file }) => /rel="canonical"/.test(readFileSync(file, 'utf8'))));
ok('no empty BreadcrumbList without SITE_URL', !artHtml.includes('"itemListElement":[]'));

build({ AIVOXFLOW_SITE_URL: 'https://aivoxflow.example' });
const sm = existsSync(path.join(dist, 'sitemap.xml')) ? readFileSync(path.join(dist, 'sitemap.xml'), 'utf8') : '';
const robots = existsSync(path.join(dist, 'robots.txt')) ? readFileSync(path.join(dist, 'robots.txt'), 'utf8') : '';
const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
ok('sitemap generated with SITE_URL', sm.startsWith('<?xml') && sm.includes('https://aivoxflow.example/articles/'));
ok('sitemap has one entry per indexable route', locs.length >= 24, `${locs.length} urls`);
ok('sitemap urls never contain a double slash', locs.every((u) => !/\/\//.test(u.replace(/^https?:\/\//, ''))),
  locs.find((u) => /\/\//.test(u.replace(/^https?:\/\//, ''))) || '');
ok('sitemap excludes search and 404', !locs.some((u) => u.includes('/search/') || u.endsWith('404.html')));
ok('sitemap lastmod is not the build date for every url',
  new Set([...sm.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((m) => m[1])).size >= 1 &&
  !locs.every((u) => sm.includes(`<loc>${u}</loc><lastmod>${new Date().toISOString().slice(0, 10)}</lastmod>`)));
ok('robots points at sitemap', robots.includes('Sitemap: https://aivoxflow.example/sitemap.xml'));
ok('canonical emitted with SITE_URL', /rel="canonical" href="https:\/\/aivoxflow\.example\//.test(readFileSync(path.join(dist, 'index.html'), 'utf8')));

const feed = existsSync(path.join(dist, 'feed.xml')) ? readFileSync(path.join(dist, 'feed.xml'), 'utf8') : '';
const jfeed = existsSync(path.join(dist, 'feed.json')) ? readFileSync(path.join(dist, 'feed.json'), 'utf8') : '';
ok('RSS feed is valid XML shape with items', feed.startsWith('<?xml') && (feed.match(/<item>/g) || []).length === 6);
ok('RSS items use absolute links', feed.includes('<link>https://aivoxflow.example/articles/'));
ok('JSON Feed is valid JSON with 6 items', (() => {
  try { return JSON.parse(jfeed).items.length === 6; } catch { return false; }
})());

const headersFile = readFileSync(path.join(dist, '_headers'), 'utf8');
ok('security headers include a CSP', /Content-Security-Policy:.*default-src 'self'/.test(headersFile));
ok('security headers include HSTS + nosniff', /Strict-Transport-Security:/.test(headersFile) && /X-Content-Type-Options: nosniff/.test(headersFile));
ok('hashed assets are immutable-cached', /Cache-Control: public, max-age=31536000, immutable/.test(headersFile));
ok('_headers carries the search noindex rule', /\/search\/\*\s+X-Robots-Tag: noindex, follow/.test(headersFile));
ok('paginated listing pages have distinct descriptions', (() => {
  const d = (f) => (readFileSync(path.join(dist, f), 'utf8').match(/<meta name="description" content="([^"]*)"/) || [])[1] || '';
  return d(path.join('articles', 'index.html')) !== d(path.join('articles', 'page', '2', 'index.html'));
})());

// The production guard: a build on a production host without AIVOXFLOW_SITE_URL
// must fail loudly instead of publishing without canonicals/sitemap/feeds.
{
  let guardError = null;
  try {
    execFileSync(process.execPath, [path.join(repo, 'site', 'build.mjs')], {
      stdio: 'pipe', cwd: repo,
      env: { ...process.env, AIVOXFLOW_ENVIRONMENT: 'production', AIVOXFLOW_SITE_URL: '' },
      encoding: 'utf8',
    });
  } catch (e) { guardError = e; }
  ok('production build without SITE_URL fails loudly',
    Boolean(guardError) && /AIVOXFLOW_SITE_URL is required/.test(String(guardError.stderr || '')),
    guardError ? String(guardError.stderr).slice(0, 120) : 'build succeeded unexpectedly');
  ok('guard failure leaves the previous dist/ untouched',
    existsSync(path.join(dist, 'index.html')) && existsSync(path.join(dist, 'assets')));
}

// ------------------------------------------------------------ 10b. structured data (URL mode)
const artHtml2 = readFileSync(path.join(dist, 'articles', 'choose-an-ai-writing-tool', 'index.html'), 'utf8');
const artLd = JSON.parse(artHtml2.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
const articleNode = artLd.find((x) => x['@type'] === 'Article');
ok('Article schema has headline/description', Boolean(articleNode.headline && articleNode.description));
ok('Article schema has datePublished + dateModified', Boolean(articleNode.datePublished && articleNode.dateModified));
ok('Article schema has inLanguage', articleNode.inLanguage === 'en');
ok('Article schema has an author with a url', Boolean(articleNode.author && articleNode.author.url));
ok('Article schema has publisher.logo', Boolean(articleNode.publisher?.logo?.url));
ok('Article schema image is absolute', Boolean(articleNode.image?.[0]?.startsWith('https://')));
const bc = artLd.find((x) => x['@type'] === 'BreadcrumbList');
ok('BreadcrumbList is present and non-empty', Boolean(bc && bc.itemListElement.length === 3));
ok('Breadcrumb items carry absolute urls', Boolean(bc && bc.itemListElement[0].item?.startsWith('http')));
ok('canonical matches og:url on articles', (() => {
  const c = artHtml2.match(/rel="canonical" href="([^"]+)"/)?.[1];
  const o = artHtml2.match(/property="og:url" content="([^"]+)"/)?.[1];
  return Boolean(c && o && c === o);
})());

// restore default build (no URL)
build();

// ------------------------------------------------------------ 11. HTTP status codes
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
const cssRes = await fetch(`http://127.0.0.1:${port}/assets/css/${cssFile}`);
ok('stylesheet serves with css content-type', (cssRes.headers.get('content-type') || '').includes('text/css'));
server.close();

// ------------------------------------------------------------ 12. budgets
const jsSize = statSync(path.join(dist, 'assets', 'js', jsFile)).size;
ok('JS budget < 9 KB', jsSize < 9216, `${jsSize} bytes`);
const cssSize = statSync(path.join(dist, 'assets', 'css', cssFile)).size;
ok('CSS < 40 KB', cssSize < 40 * 1024, `${cssSize} bytes`);
const htmlSize = statSync(path.join(dist, 'index.html')).size;
ok('homepage HTML < 24 KB', htmlSize < 24 * 1024, `${htmlSize} bytes`);

// ------------------------------------------------------------ 13. content agents
// The pipeline must run end to end offline and must refuse to publish a scaffold.
// Exit code 3 = needs_human_review, which is the correct outcome for mock output.
let agentStatus = 0;
let agentOut = '';
try {
  agentOut = execFileSync(process.execPath, [
    path.join(repo, 'agents', 'run.mjs'),
    '--topic', 'agent smoke test topic',
    '--category', 'ai-tools',
    '--fixture', path.join(repo, 'agents', 'fixtures', 'demo-research.json'),
    '--force',
  ], { cwd: repo, encoding: 'utf8', stdio: 'pipe' });
} catch (e) {
  agentStatus = e.status;
  agentOut = `${e.stdout || ''}${e.stderr || ''}`;
}
ok('agent pipeline runs offline', agentOut.includes('Editorial QA'), agentOut.slice(-200));
ok('agent pipeline blocks mock output (exit 3)', agentStatus === 3, `exit ${agentStatus}`);
ok('agent gates name their reasons', /FAIL\s+structure/.test(agentOut) && /FAIL\s+sourcing/.test(agentOut));
ok('agent never writes a draft into site/data', !existsSync(path.join(repo, 'site', 'data', 'articles', 'agent-smoke-test-topic.json')));

// ------------------------------------------------------------ 14. scheduling
// A scheduled article is written ahead of its slot and dated for it. The build
// must hide it until that date, or a nightly cron would leak tomorrow's piece.
{
  const futureDate = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const futureFile = path.join(repo, 'site', 'data', 'articles', '99-zz-future-test.json');
  writeFileSync(futureFile, `${JSON.stringify({
    slug: 'zz-future-test',
    title: 'Scheduled article that must stay hidden',
    description: 'Fixture article used by the test suite to prove future-dated content is withheld until its slot.',
    category: 'ai-tools',
    published: futureDate,
    author: 'AIVOXFLOW Editorial',
    authorSlug: 'editorial',
    tags: ['test'],
    body: '## A heading\n\nBody text for the scheduling test.',
  }, null, 2)}\n`, 'utf8');

  try {
    const out = build();
    ok('future-dated article is not built', !existsSync(path.join(dist, 'articles', 'zz-future-test', 'index.html')));
    ok('build reports held-back articles', /Scheduled: 1/.test(out), out.slice(-120));
    ok('held-back article is absent from the sitemap feed',
      !readFileSync(path.join(dist, 'assets', 'search-index.json'), 'utf8').includes('zz-future-test'));

    build({ AIVOXFLOW_INCLUDE_FUTURE: '1' });
    ok('preview mode includes scheduled articles',
      existsSync(path.join(dist, 'articles', 'zz-future-test', 'index.html')));
  } finally {
    rmSync(futureFile, { force: true });
    build();
  }
}

// ------------------------------------------------------------ 15. emergency stop + rollback
// Autonomous publishing needs two controls before it may run unattended: a
// one-file emergency stop, and a way to pull a live article. Both are asserted
// here against real spawned processes.
{
  const stopFile = path.join(repo, 'content', 'SCHEDULER_STOP');
  const spawn = (args) => {
    try {
      return { status: 0, out: execFileSync(process.execPath, args, { cwd: repo, encoding: 'utf8', stdio: 'pipe' }) };
    } catch (e) { return { status: e.status, out: `${e.stdout || ''}${e.stderr || ''}` }; }
  };
  try {
    writeFileSync(stopFile, 'paused by test\n', 'utf8');

    // A new job must be refused while the stop is in place.
    const blocked = spawn([path.join(repo, 'agents', 'run.mjs'), '--topic', 'emergency stop probe', '--force']);
    ok('emergency stop blocks a new job (exit 1)', blocked.status === 1, `exit ${blocked.status}`);
    ok('emergency stop explains itself', /SCHEDULER_STOP exists/.test(blocked.out), blocked.out.slice(-120));

    // Recovery paths stay open during an emergency: --list must still work.
    const listed = spawn([path.join(repo, 'agents', 'run.mjs'), '--list']);
    ok('emergency stop leaves --list usable', listed.status === 0, `exit ${listed.status}`);

    // The scheduler halts its cycle before touching the calendar or providers.
    const paused = spawn([path.join(repo, 'agents', 'scheduler.mjs'), '--once']);
    ok('emergency stop pauses the scheduler cycle', paused.status === 0 && /paused/.test(paused.out),
      `exit ${paused.status} — ${paused.out.slice(-120)}`);
  } finally {
    rmSync(stopFile, { force: true });
  }

  // Rollback: a published article is quarantined (never deleted) and disappears
  // from the build. --deploy is omitted so this stays offline.
  const slug = 'zz-unpublish-test';
  const artFile = path.join(repo, 'site', 'data', 'articles', `${slug}.json`);
  const quarantine = path.join(repo, 'content', 'unpublished');
  writeFileSync(artFile, `${JSON.stringify({
    slug,
    title: 'Rollback fixture',
    description: 'Temporary article proving --unpublish quarantines and rebuilds without it.',
    category: 'ai-tools',
    published: new Date().toISOString().slice(0, 10),
    author: 'AIVOXFLOW Editorial',
    authorSlug: 'editorial',
    tags: ['test'],
    body: '## Heading\n\nBody for the rollback test.',
  }, null, 2)}\n`, 'utf8');
  try {
    build();
    ok('rollback fixture is built before unpublish', existsSync(path.join(dist, 'articles', slug, 'index.html')));

    const un = spawn([path.join(repo, 'agents', 'scheduler.mjs'), '--unpublish', slug]);
    ok('unpublish runs', un.status === 0, `exit ${un.status} — ${un.out.slice(-160)}`);
    ok('unpublish removes the article from site/data', !existsSync(artFile));
    const qFile = readdirSync(quarantine).find((f) => f.endsWith(`-${slug}.json`));
    ok('unpublish quarantines (does not delete) the article', Boolean(qFile), qFile || 'no quarantine file');
    ok('unpublish rebuilds the article out of the site',
      !existsSync(path.join(dist, 'articles', slug, 'index.html')));
  } finally {
    rmSync(artFile, { force: true });
    if (existsSync(quarantine)) for (const f of readdirSync(quarantine)) {
      if (f.includes(`-${slug}`)) rmSync(path.join(quarantine, f), { force: true, recursive: true });
    }
    build();
  }
}

// ------------------------------------------------------------ summary
console.log(`\n${checks - failures}/${checks} checks passed${failures ? ` — ${failures} FAILED` : ''}`);
if (failures) process.exit(1);
