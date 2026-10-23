// AIVOXFLOW editorial hero POC — Approach A (flux art + HTML text overlay).
//
// Renders a 1600x900 article hero the same way site/og/generate.mjs renders
// social cards: an HTML composite screenshotted through the local Edge/Chrome
// over CDP. Text (title, subtitle, the four labels) is real HTML, so it is
// always spelled correctly — raw flux text generation is garbled (verified).
//
// The central illustration comes from Pollinations/flux (text-free, brand-
// locked prompt) and is clipped inside a frame so the pollinations.ai corner
// watermark is cut off. Everything else is deterministic HTML/CSS/SVG.
//
//   node site/hero-poc.mjs            # write docs/hero-poc-01.png
//
// The PNG is a scratch artifact until an operator approves regenerating the
// published heroes; this file does not touch site/assets-src or deploy.
import { spawn, execFileSync } from 'node:child_process';
import { writeFileSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(here, '..');
// Scratch output (PNG, HTML and the debug art dump) all land in docs/render/,
// which is git-ignored — this file is a dead-end experiment kept only as a
// record of what Approach A could not do.
const outDir = path.join(repo, 'docs', 'render');
const out = path.join(outDir, 'hero-poc-01.png');
const W = 1600;
const H = 900;

// ------------------------------------------------- article 01 content
// Short labels derived from the article's own `##` sections (see
// site/data/articles/01-choose-an-ai-writing-tool.json) — not invented.
const art = {
  pre: 'How to Choose an',
  hl: 'AI Writing Tool',
  sub: 'A Practical Checklist',
  labels: [
    { dot: '#FF5C5C', text: 'Define Your Task' },
    { dot: '#FFB23F', text: 'Check the Free Tier' },
    { dot: '#3DDC97', text: 'Read the Data Terms' },
    { dot: '#4C8DFF', text: 'Price the Second Year' },
  ],
  // Text-free, brand-locked so flux cannot drift to stock-photo orange.
  prompt: '3D isometric digital illustration of a sleek open laptop showing an '
    + 'AI writing interface with glowing blue text lines, floating selection '
    + 'cards with checkmarks and a magnifying glass orbiting it, deep navy blue '
    + 'background, electric blue and cyan glowing accents, soft depth of field, '
    + 'cinematic rim lighting, floating light particles, modern tech editorial '
    + 'style, centered composition, no text, no words, no letters, no watermark, '
    + 'no logos',
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const check = `<svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
  <path d="M7 17 l6 6 l12 -14" fill="none" stroke="#fff" stroke-width="3.5"
    stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const label = (l) => `<div class="lbl">
  <span class="tick">${check}</span>
  <span class="txt">${esc(l.text)}</span>
</div>`;

// Build the markup only AFTER the flux art is in hand: `html` is a const whose
// template reads art.imgUrl, so fetching first is what makes the src real
// (otherwise the <img> gets src="undefined" and captures empty).
art.imgUrl = await fetchArt();

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:${W}px;height:${H}px;overflow:hidden;position:relative;
    background:linear-gradient(135deg,#050d22 0%,#08152f 44%,#0e2049 100%);
    color:#fff;font-family:"Segoe UI","Inter",system-ui,sans-serif}
  .glow{position:absolute;width:1100px;height:1100px;border-radius:50%;left:50%;top:-46%;
    transform:translateX(-50%);background:radial-gradient(circle,rgba(76,141,255,.34),transparent 62%)}
  .glow2{position:absolute;width:760px;height:760px;border-radius:50%;left:-14%;bottom:-30%;
    background:radial-gradient(circle,rgba(30,107,255,.26),transparent 60%)}
  .grid{position:absolute;inset:0;opacity:.5;
    background-image:linear-gradient(rgba(76,141,255,.10) 1px,transparent 1px),
      linear-gradient(90deg,rgba(76,141,255,.10) 1px,transparent 1px);
    background-size:64px 64px;
    -webkit-mask-image:radial-gradient(circle at 50% 40%,#000,transparent 78%)}
  .wrap{position:relative;height:100%;display:flex;flex-direction:column;
    align-items:center;padding:54px 64px 40px}
  h1{font-size:76px;line-height:1.06;font-weight:800;letter-spacing:-.02em;text-align:center;
    text-shadow:0 6px 30px rgba(0,0,0,.45)}
  h1 .hl{color:#FFB23F}
  .sub{display:flex;align-items:center;gap:14px;margin-top:20px;font-size:34px;font-weight:600;
    color:#E9EDF4}
  .sub .box{width:44px;height:44px;border-radius:11px;background:#0E2049;border:1px solid #163064;
    display:flex;align-items:center;justify-content:center}
  .stage{flex:1;display:flex;align-items:center;justify-content:center;gap:40px;width:100%;
    margin-top:34px}
  .col{display:flex;flex-direction:column;gap:70px;flex:0 0 auto}
  .lbl{display:flex;align-items:center;gap:14px;max-width:340px;
    background:rgba(14,32,73,.72);border:1px solid rgba(76,141,255,.35);
    border-radius:14px;padding:16px 20px;backdrop-filter:blur(6px);
    box-shadow:0 10px 30px rgba(0,0,0,.35)}
  .lbl .tick{flex:0 0 auto;width:40px;height:40px;border-radius:10px;background:#163064;
    display:flex;align-items:center;justify-content:center}
  .lbl .txt{font-size:27px;font-weight:700;line-height:1.16}
  .frame{flex:0 0 auto;width:700px;height:400px;border-radius:20px;overflow:hidden;
    border:1px solid rgba(76,141,255,.45);box-shadow:0 24px 60px rgba(0,0,0,.5);
    background:#0b1a3d}
  /* Natural ratio 700x443 overflows a 400px box by 43px, so the bottom strip —
     where the pollinations.ai watermark sits — is clipped off by overflow. */
  .frame img{display:block;width:100%;height:auto}
  .brand{display:flex;align-items:center;gap:12px;margin-top:6px;font-size:22px;font-weight:800;
    letter-spacing:.02em;color:#98A1B3}
  .brand i{color:#4C8DFF;font-style:normal}
</style></head><body>
  <div class="glow"></div><div class="glow2"></div><div class="grid"></div>
  <div class="wrap">
    <h1>${esc(art.pre)} <span class="hl">${esc(art.hl)}</span></h1>
    <div class="sub"><span class="box">${check}</span>${esc(art.sub)}</div>
    <div class="stage">
      <div class="col">${label(art.labels[0])}${label(art.labels[2])}</div>
      <div class="frame"><img src="${art.imgUrl}" alt=""></div>
      <div class="col">${label(art.labels[1])}${label(art.labels[3])}</div>
    </div>
    <div class="brand">AIVO<i>X</i>FLOW<span style="color:#59627A;font-weight:600"> · Intelligence in Motion</span></div>
  </div>
</body></html>`;

// ---------------------------------------------------------------- flux art
async function fetchArt() {
  const base = 'https://image.pollinations.ai/prompt/';
  const seed = Math.floor(Math.random() * 1e9);
  const url = `${base}${encodeURIComponent(art.prompt)}?width=1200&height=760`
    + `&model=flux&nologo=true&seed=${seed}`;
  let last = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const t0 = Date.now();
      const res = await fetch(url, { signal: AbortSignal.timeout(120000) });
      const ct = res.headers.get('content-type') || '';
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!ct.startsWith('image/')) throw new Error(`content-type ${ct}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 512) throw new Error('empty image');
      const mime = ct.split(';')[0];
      const dbg = path.join(outDir, 'hero-poc-art.jpg');
      writeFileSync(dbg, buf);
      console.log(`flux  ok ${buf.length}B ${ct} ${Date.now() - t0}ms (attempt ${attempt + 1})`);
      // Embed as a data URI: a data: image always decodes in the headless page,
      // unlike a file:// subresource which the screenshot can miss.
      return `data:${mime};base64,${buf.toString('base64')}`;
    } catch (e) {
      last = e;
      console.log(`flux  retry ${attempt + 1}: ${e.message}`);
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  throw last;
}

mkdirSync(outDir, { recursive: true });

// ---------------------------------------------------------------- browser
const candidates = [
  path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
];
const browser = candidates.find((c) => existsSync(c));
if (!browser) { console.error('No Edge/Chrome found.'); process.exit(1); }

const port = 9483;
const udd = path.join(process.env.TEMP || '/tmp', `aivox-hero-poc-${process.pid}`);
rmSync(udd, { recursive: true, force: true });
const proc = spawn(browser, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', '--force-device-scale-factor=1',
  `--user-data-dir=${udd}`, `--remote-debugging-port=${port}`, '--remote-allow-origins=*',
  'about:blank',
], { stdio: 'ignore', windowsHide: true });
const stop = () => {
  try { execFileSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ }
  try { rmSync(udd, { recursive: true, force: true }); } catch { /* locked */ }
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
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
const file = path.join(outDir, `hero-poc-${process.pid}.html`);
writeFileSync(file, html, 'utf8');
const loaded = new Promise((r) => { onLoad = r; });
await send('Page.navigate', { url: `file:///${file.replace(/\\/g, '/')}` });
await Promise.race([loaded, new Promise((_, rej) => setTimeout(() => rej(new Error('load timeout')), 15000))]);
// Wait until the embedded data: <img> has actually decoded (naturalWidth>0)
// before the screenshot — otherwise the frame captures empty.
const deadline = Date.now() + 8000;
for (;;) {
  const st = await send('Runtime.evaluate', {
    expression: '(()=>{const i=document.querySelector(".frame img");return i?{c:i.complete,n:i.naturalWidth,h:i.naturalHeight}:"noimg"})()',
    returnByValue: true,
  });
  const v = st.result && st.result.value;
  if (v && v.c && v.n > 0) { console.log(`img   ready ${v.n}x${v.h}`); break; }
  if (Date.now() > deadline) { console.log(`img   NOT ready: ${JSON.stringify(v)}`); break; }
  await new Promise((r) => setTimeout(r, 150));
}
await new Promise((r) => setTimeout(r, 300)); // let it paint
const shot = await send('Page.captureScreenshot', {
  format: 'png', captureBeyondViewport: false,
  clip: { x: 0, y: 0, width: W, height: H, scale: 1 },
});
writeFileSync(out, Buffer.from(shot.data, 'base64'));
try { rmSync(file, { force: true }); } catch { /* ignore */ }
console.log(`write  ${path.relative(repo, out)}`);
process.exit(0);
