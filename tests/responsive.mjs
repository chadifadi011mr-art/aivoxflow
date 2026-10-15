// AIVOXFLOW responsive / keyboard test — drives Edge headless over CDP.
// Usage: node tests/responsive.mjs
// Requires local Microsoft Edge (documented machine requirement).
// Covers: horizontal-overflow detection at 375/768/1280/1600 across key
// routes (identifying the offending element), skip-link keyboard focus,
// search page JS behavior, and full-page screenshots (JS executed).
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync, statSync, readdirSync } from 'node:fs';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(root, '..');
const dist = path.join(repo, 'dist');
const shotsDir = path.join(repo, 'docs', 'qa-shots');
mkdirSync(shotsDir, { recursive: true });

let failures = 0, checks = 0;
const ok = (name, cond, detail = '') => {
  checks++;
  if (cond) console.log(`PASS  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
};

// ------------------------------------------------------------ static server
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  let file = path.join(dist, url);
  if (url.endsWith('/')) file = path.join(file, 'index.html');
  if (existsSync(file) && statSync(file).isFile()) {
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(readFileSync(file));
  } else {
    res.writeHead(404, { 'content-type': 'text/html' });
    res.end(readFileSync(path.join(dist, '404.html')));
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

// ------------------------------------------------------------ launch Edge
const edge = path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe');
if (!existsSync(edge)) { console.log(`SKIP  Edge not found at ${edge} — responsive test needs it.`); process.exit(0); }
const port = 9455;
const udd = path.join(process.env.TEMP, `ax-cdp-${process.pid}`);
rmSync(udd, { recursive: true, force: true });
const proc = spawn(edge, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', '--force-device-scale-factor=1',
  `--user-data-dir=${udd}`, `--remote-debugging-port=${port}`,
  '--remote-allow-origins=*', 'about:blank',
], { stdio: 'ignore', windowsHide: true });

const cleanup = () => {
  try { execFileSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore' }); } catch {}
  try { rmSync(udd, { recursive: true, force: true }); } catch {}
  server.close();
};
process.on('exit', cleanup);

// wait for devtools endpoint
let ver = null;
for (let t = 0; t < 50 && !ver; t++) {
  try { ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); } catch { await new Promise((r) => setTimeout(r, 200)); }
}
if (!ver) { console.log('FAIL  Edge DevTools endpoint never came up'); process.exit(1); }
let targets = [];
for (let t = 0; t < 30 && !targets.length; t++) {
  try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { await new Promise((r) => setTimeout(r, 200)); }
}
const page = targets.find((x) => x.type === 'page');
if (!page) { console.log('FAIL  no page target'); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('cdp websocket failed')); });
let id = 0; const pending = new Map(); let onLoad = null;
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id); pending.delete(m.id);
    m.error ? rej(new Error(m.error.message)) : res(m.result);
  } else if (m.method === 'Page.loadEventFired' && onLoad) { onLoad(); onLoad = null; }
};
const send = (method, params = {}) => new Promise((res, rej) => {
  const mid = ++id; pending.set(mid, { res, rej });
  ws.send(JSON.stringify({ id: mid, method, params }));
});
const evalJs = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result.value;
const navigate = async (url) => {
  const loadP = new Promise((r) => { onLoad = r; });
  await send('Page.navigate', { url });
  await Promise.race([loadP, new Promise((_, rej) => setTimeout(() => rej(new Error('load timeout')), 12000))]);
  await new Promise((r) => setTimeout(r, 120)); // settle deferred scripts
};

await send('Page.enable');
await send('Runtime.enable');

// ------------------------------------------------------------ test matrix
const PAGES = [
  { n: 'home', u: '/' },
  { n: 'article', u: '/articles/choose-an-ai-writing-tool/' },
  { n: 'articles-list', u: '/articles/' },
  { n: 'tools', u: '/tools/' },
  { n: 'category', u: '/category/ai-tools/' },
  { n: 'static-about', u: '/about/' },
];
const WIDTHS = [375, 768, 1280, 1600];
const overflowIssues = [];
const OVERFLOW_PROBE = `(() => {
  const vw = window.innerWidth;
  const els = [...document.querySelectorAll('body *')].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.right > vw + 1 && r.right > 0;
  });
  return {
    vw,
    scrollW: document.documentElement.scrollWidth,
    offenders: els.slice(0, 6).map((el) => {
      const r = el.getBoundingClientRect();
      const cls = typeof el.className === 'string' && el.className ? '.' + el.className.split(' ')[0] : '';
      return el.tagName.toLowerCase() + cls + ' right=' + Math.round(r.right) + ' w=' + Math.round(r.width);
    }),
  };
})()`;

for (const w of WIDTHS) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: w <= 480 });
  for (const pg of PAGES) {
    try {
      await navigate(base + pg.u);
      const r = await evalJs(OVERFLOW_PROBE);
      const clean = r.scrollW <= r.vw + 1;
      if (!clean) overflowIssues.push(`${pg.n}@${w}: scrollW=${r.scrollW} vw=${r.vw} :: ${r.offenders.join(' | ')}`);
      ok(`no h-overflow ${pg.n} @${w}`, clean, `scrollW=${r.scrollW} ${r.offenders.join(' | ')}`);
    } catch (e) {
      ok(`no h-overflow ${pg.n} @${w}`, false, e.message);
    }
  }
}

// ------------------------------------------------------------ keyboard: skip link
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
await navigate(base + '/');
const pressTab = async () => {
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
  await new Promise((r) => setTimeout(r, 60));
};
await pressTab();
const active1 = await evalJs(`document.activeElement.className || document.activeElement.tagName`);
ok('first Tab focuses skip link', String(active1).includes('skip-link'), `got: ${active1}`);
const skipRect = await evalJs(`(() => { const r = document.activeElement.getBoundingClientRect(); return { left: Math.round(r.left) }; })()`);
ok('skip link visible when focused', skipRect.left >= 0, `left=${skipRect.left}`);
await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
await new Promise((r) => setTimeout(r, 120));
const hash = await evalJs(`location.hash`);
ok('skip link jumps to #main', hash === '#main', `hash=${hash}`);

// mobile nav toggle (aria-expanded correctness)
await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 900, deviceScaleFactor: 1, mobile: true });
await navigate(base + '/');
const navBefore = await evalJs(`(() => { const t = document.querySelector('.nav-toggle'); const n = document.getElementById('site-nav'); return { expanded: t.getAttribute('aria-expanded'), visible: getComputedStyle(n).display !== 'none' }; })()`);
ok('mobile nav collapsed by default with aria-expanded=false', navBefore.expanded === 'false' && navBefore.visible === false, JSON.stringify(navBefore));
await evalJs(`document.querySelector('.nav-toggle').click()`);
const navAfter = await evalJs(`(() => { const t = document.querySelector('.nav-toggle'); const n = document.getElementById('site-nav'); return { expanded: t.getAttribute('aria-expanded'), visible: getComputedStyle(n).display !== 'none' }; })()`);
ok('mobile nav opens + aria-expanded=true', navAfter.expanded === 'true' && navAfter.visible === true, JSON.stringify(navAfter));

// ------------------------------------------------------------ search behavior (JS)
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
await navigate(`${base}/search/?q=automation`);
let statusText = '';
for (let t = 0; t < 25 && !statusText; t++) {
  statusText = await evalJs(`document.getElementById('search-status').textContent`);
  if (!statusText) await new Promise((r) => setTimeout(r, 150));
}
ok('search returns results for "automation"', /2 results/.test(statusText), `status="${statusText}"`);
const resultCount = await evalJs(`document.querySelectorAll('#search-results li').length`);
ok('search renders result items', resultCount === 2, `items=${resultCount}`);

// ------------------------------------------------------------ screenshots (JS executed)
async function shoot(name, url, width) {
  await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width <= 480 });
  await navigate(url);
  await new Promise((r) => setTimeout(r, 250));
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  writeFileSync(path.join(shotsDir, `${name}.png`), Buffer.from(shot.data, 'base64'));
  console.log(`SHOT  ${name}.png`);
}
await shoot('cdp-home-375-full', base + '/', 375);
await shoot('cdp-article-375-full', base + '/articles/choose-an-ai-writing-tool/', 375);
await shoot('cdp-home-768-full', base + '/', 768);
await shoot('cdp-search-1280', `${base}/search/?q=automation`, 1280);

ws.close();
console.log(`\n${checks - failures}/${checks} responsive checks passed${failures ? ` — ${failures} FAILED` : ''}`);
if (overflowIssues.length) console.log('\nOverflow issues:\n  ' + overflowIssues.join('\n  '));
process.exit(failures ? 1 : 0);
