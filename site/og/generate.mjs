// AIVOXFLOW social-card generator.
// Renders 1200×630 PNGs with the local Edge/Chrome build (no image library,
// no design tool) and writes them to site/assets-src/og/.
//
//   node site/og/generate.mjs            # only missing cards
//   node site/og/generate.mjs --force    # regenerate everything
//
// The PNGs are committed so `npm run build` never needs a browser.
import { spawn, execFileSync } from 'node:child_process';
import {
  writeFileSync, existsSync, rmSync, mkdirSync, readFileSync, readdirSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(here, '..', '..');
const outDir = path.join(repo, 'site', 'assets-src', 'og');
const tmpDir = path.join(process.env.TEMP || '/tmp', `aivox-og-${process.pid}`);
const force = process.argv.includes('--force');

mkdirSync(outDir, { recursive: true });
mkdirSync(tmpDir, { recursive: true });

// ---------------------------------------------------------------- content
const categories = JSON.parse(readFileSync(path.join(repo, 'site', 'data', 'categories.json'), 'utf8')).categories;
const catName = Object.fromEntries(categories.map((c) => [c.slug, c.name]));
const articles = readdirSync(path.join(repo, 'site', 'data', 'articles'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(path.join(repo, 'site', 'data', 'articles', f), 'utf8')));

const cards = [
  { name: 'default', eyebrow: 'Intelligence in Motion', title: 'Discover AI. Master Tools. Automate More.', foot: 'Practical, source-first AI coverage' },
  { name: 'tools', eyebrow: 'AI Tools Index', title: 'AI tools, verified against official sources', foot: 'Dated checks. No affiliate links.' },
  ...articles.map((a) => ({
    name: a.slug,
    eyebrow: catName[a.category] || a.category,
    title: a.title,
    foot: `AIVOXFLOW Editorial · ${Math.max(1, Math.round(a.body.split(/\s+/).length / 200))} min read`,
  })),
];

// ---------------------------------------------------------------- template
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const size = (t) => (t.length > 72 ? 50 : t.length > 52 ? 58 : t.length > 34 ? 66 : 76);

const html = (c) => `<!doctype html><html><head><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:1200px;height:630px;overflow:hidden;background:#08152F;color:#fff;
    font-family:"Segoe UI","Inter",system-ui,sans-serif;position:relative}
  .glow{position:absolute;inset:-30% -10% auto auto;width:900px;height:900px;border-radius:50%;
    background:radial-gradient(circle,rgba(76,141,255,.30),transparent 62%)}
  .lines{position:absolute;inset:0;opacity:.55}
  .frame{position:relative;height:100%;padding:58px 72px;display:flex;flex-direction:column}
  .mid{flex:1;display:flex;flex-direction:column;justify-content:center;padding-bottom:12px}
  .top{display:flex;align-items:center;gap:16px}
  .mark{width:46px;height:46px;border-radius:11px;background:#0E2049;display:flex;align-items:center;justify-content:center}
  .word{font-size:24px;font-weight:800;letter-spacing:.02em}
  .word i{color:#4C8DFF;font-style:normal}
  .eyebrow{margin-top:38px;font-size:19px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#4C8DFF}
  h1{margin-top:16px;font-size:${size(c.title)}px;line-height:1.14;font-weight:800;letter-spacing:-.02em;max-width:1010px}
  .foot{display:flex;align-items:center;justify-content:space-between;border-top:1px solid rgba(255,255,255,.16);padding-top:22px;
    font-size:20px;color:#98A1B3}
  .dot{width:9px;height:9px;border-radius:50%;background:#4C8DFF;display:inline-block;margin-right:10px}
</style></head><body>
  <div class="glow"></div>
  <svg class="lines" viewBox="0 0 1200 630" fill="none" aria-hidden="true">
    <g stroke="#4C8DFF" stroke-width="2" opacity=".18">
      <path d="M-40 520 C 220 520, 300 380, 560 380 S 900 230, 1240 230"/>
      <path d="M-40 580 C 260 580, 340 440, 600 440 S 940 290, 1280 290" opacity=".6"/>
    </g>
  </svg>
  <div class="frame">
    <div class="top">
        <div class="mark">
          <svg width="26" height="26" viewBox="0 0 32 32"><path d="M7 21.5 13 15 19 19 25 10" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="7" cy="21.5" r="2.5" fill="#4C8DFF"/><circle cx="25" cy="10" r="3" fill="#1E6BFF"/></svg>
        </div>
        <div class="word">AIVO<i>X</i>FLOW</div>
      </div>
    <div class="mid">
      <div class="eyebrow">${esc(c.eyebrow)}</div>
      <h1>${esc(c.title)}</h1>
    </div>
    <div class="foot"><span><span class="dot"></span>${esc(c.foot)}</span><span>aivoxflow.com</span></div>
  </div>
</body></html>`;

// ---------------------------------------------------------------- browser
const candidates = [
  path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
];
const browser = candidates.find((c) => existsSync(c));
if (!browser) {
  console.error('No Edge/Chrome found. Install one, or commit the PNGs and skip this step.');
  process.exit(1);
}

const port = 9481;
const udd = path.join(process.env.TEMP || '/tmp', `aivox-og-profile-${process.pid}`);
rmSync(udd, { recursive: true, force: true });
const proc = spawn(browser, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', '--force-device-scale-factor=1',
  `--user-data-dir=${udd}`, `--remote-debugging-port=${port}`, '--remote-allow-origins=*',
  'about:blank',
], { stdio: 'ignore', windowsHide: true });

const stop = () => {
  try { execFileSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* already gone */ }
  try { rmSync(udd, { recursive: true, force: true }); } catch { /* locked, ignore */ }
};
process.on('exit', stop);

let version = null;
for (let t = 0; t < 60 && !version; t++) {
  try { version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); } catch { await new Promise((r) => setTimeout(r, 200)); }
}
if (!version) { console.error('DevTools endpoint never came up.'); process.exit(1); }

let targets = [];
for (let t = 0; t < 30 && !targets.length; t++) {
  try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { await new Promise((r) => setTimeout(r, 200)); }
}
const page = targets.find((x) => x.type === 'page');
if (!page) { console.error('No page target.'); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('CDP socket failed')); });
let id = 0;
const pending = new Map();
let onLoad = null;
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? rej(new Error(m.error.message)) : res(m.result);
  } else if (m.method === 'Page.loadEventFired' && onLoad) { onLoad(); onLoad = null; }
};
const send = (method, params = {}) => new Promise((res, rej) => {
  const mid = ++id;
  pending.set(mid, { res, rej });
  ws.send(JSON.stringify({ id: mid, method, params }));
});

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 630, deviceScaleFactor: 1, mobile: false });

let written = 0;
for (const card of cards) {
  const target = path.join(outDir, `${card.name}.png`);
  if (!force && existsSync(target)) { console.log(`skip   ${card.name}.png (exists)`); continue; }
  const file = path.join(tmpDir, `${card.name}.html`);
  writeFileSync(file, html(card), 'utf8');
  const loaded = new Promise((r) => { onLoad = r; });
  await send('Page.navigate', { url: `file:///${file.replace(/\\/g, '/')}` });
  await Promise.race([loaded, new Promise((_, rej) => setTimeout(() => rej(new Error('load timeout')), 10000))]);
  await new Promise((r) => setTimeout(r, 120));
  const shot = await send('Page.captureScreenshot', {
    format: 'png', captureBeyondViewport: false,
    clip: { x: 0, y: 0, width: 1200, height: 630, scale: 1 },
  });
  writeFileSync(target, Buffer.from(shot.data, 'base64'));
  written++;
  console.log(`write  ${card.name}.png`);
}

try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
console.log(`Done: ${written} card(s) written to site/assets-src/og/`);
process.exit(0);
