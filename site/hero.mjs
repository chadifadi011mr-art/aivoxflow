// AIVOXFLOW editorial hero renderer — Approach B: pure HTML/CSS/SVG.
//
// Why B: flux/Pollinations could not reliably render the text-heavy editorial
// hero (garbled titles, off-brand drift, an unavoidable corner watermark, and
// intermittent HTTP 402 rate limits — all verified in site/hero-poc.mjs, the
// Approach-A experiment). So the whole scene is deterministic vector art:
// crisp HTML text (always spelled correctly) over a layered SVG composition.
// No network, no quota, no watermark, identical quality every run.
//
// Renders 1600x900 PNGs through the local Edge/Chrome over CDP — the same
// mechanism site/og/generate.mjs uses for social cards.
//
//   node site/hero.mjs              # every article in HEROES
//   node site/hero.mjs --slug <s>   # just one
//
// Emits docs/hero-<slug>.png for operator review. Promoting into the published
// asset tree (site/assets-src/...) and rebuild + deploy are a separate,
// explicitly approved step — nothing here touches production.
import { spawn, execFileSync } from 'node:child_process';
import { writeFileSync, existsSync, rmSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(here, '..');
const outDir = path.join(repo, 'docs');
const W = 1600;
const H = 900;

// Per-article art, esc(), and meta() now live in the shared hero-config
// module so Approach B (here) and Approach C (hero-ai.mjs) stay in sync.
import { HEROES, esc, meta } from './hero-config.mjs';

// A category glyph drawn inside the glowing core (stroke-based, reads small).
const GLYPHS = {
  tools: '<path d="M-22 -14 h44 M-22 0 h44 M-22 14 h44"/><circle cx="-6" cy="-14" r="6.5" fill="#0b1936"/><circle cx="12" cy="0" r="6.5" fill="#0b1936"/><circle cx="-2" cy="14" r="6.5" fill="#0b1936"/>',
  tutorials: '<path d="M-20 -16 h40 v30 a4 4 0 0 1 -4 4 h-32 a4 4 0 0 1 -4 -4 z"/><path d="M-12 -6 h24 M-12 2 h16"/>',
  'automation-agents': '<path d="M4 -20 L-14 4 h12 l-4 16 L14 -2 h-12 z"/>',
  comparisons: '<path d="M0 -18 v34 M-18 16 h36 M-14 -8 L-22 6 h16 z M14 -8 L6 6 h16 z"/>',
  'ai-news': '<path d="M-20 -16 h32 a4 4 0 0 1 4 4 v24 a4 4 0 0 1 -4 4 h-32 a4 4 0 0 1 -4 -4 v-24 a4 4 0 0 1 4 -4 z"/><path d="M-14 -6 h20 M-14 2 h20 M-14 10 h12"/>',
  'software-web': '<rect x="-22" y="-16" width="44" height="32" rx="4"/><path d="M-22 -6 h44"/><circle cx="-15" cy="-1" r="2.2" fill="#fff"/><circle cx="-8" cy="-1" r="2.2" fill="#fff"/>',
};

// ------------------------------------------------- the layered SVG scene
// 720x460 stage. Depth stack: vignette + nebula + grid floor, dashed links
// with travelling sparks, gradient orbit rings with haloed nodes, three tilted
// glass panels (bars / area-line / node-graph) with contact shadows, and a
// glossy 3D core (shaded sphere + specular + rim light + glyph) orbited by a
// satellite. A fine grain overlay keeps it from looking flat-vector.
function scene(glyph) {
  const g = GLYPHS[glyph] || GLYPHS.tools;
  const Wv = 720, Hv = 460, cx = 360, cy = 232;

  // glass panels: [x, y, w, h, rot, kind, hue]
  const panels = [
    [36, 44, 196, 116, -5, 'bars', '#4C8DFF'],
    [498, 60, 196, 116, 5, 'area', '#FFB23F'],
    [70, 318, 196, 108, -4, 'nodes', '#3DDC97'],
  ];

  const panelBody = ([x, y, w, h, rot, kind, hue]) => {
    const hx = x + 14, hy = y + 14;
    let inner = '';
    if (kind === 'bars') {
      const hs = [34, 58, 44, 72, 52, 64];
      inner = `<line x1="${hx}" y1="${y + h - 22}" x2="${x + w - 16}" y2="${y + h - 22}" stroke="#4C8DFF" stroke-width="1" opacity=".35"/>`
        + hs.map((bh, i) => {
          const bx = hx + 6 + i * 27, by = y + h - 22 - bh;
          return `<rect x="${bx}" y="${by}" width="15" height="${bh}" rx="4" fill="url(#barG)" opacity="${(0.6 + i * 0.07).toFixed(2)}"/>`;
        }).join('');
    } else if (kind === 'area') {
      const pts = [64, 40, 54, 30, 44, 50, 20];
      const xs = pts.map((_, i) => hx + 8 + i * 24);
      const ys = pts.map((v) => y + h - 24 - v);
      const line = pts.map((v, i) => `${i ? 'L' : 'M'} ${xs[i]} ${y + h - 24 - v}`).join(' ');
      const area = `${line} L ${xs[xs.length - 1]} ${y + h - 24} L ${xs[0]} ${y + h - 24} Z`;
      inner = `<path d="${area}" fill="url(#areaG)" opacity=".55"/>`
        + `<path d="${line}" fill="none" stroke="${hue}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`
        + `<circle cx="${xs[xs.length - 1]}" cy="${ys[ys.length - 1]}" r="5.5" fill="${hue}"/>`
        + `<circle cx="${xs[xs.length - 1]}" cy="${ys[ys.length - 1]}" r="10" fill="${hue}" opacity=".28"/>`;
    } else {
      const N = [[x + 40, y + 40], [x + 104, y + 28], [x + 156, y + 60], [x + 66, y + 76], [x + 128, y + 82]];
      inner = [[0, 1], [1, 2], [0, 3], [3, 4], [4, 2], [1, 4]].map(([a, b]) =>
        `<line x1="${N[a][0]}" y1="${N[a][1]}" x2="${N[b][0]}" y2="${N[b][1]}" stroke="#4C8DFF" stroke-width="1.7" opacity=".55"/>`).join('')
        + N.map(([nx, ny], i) => `${i === 1 ? `<circle cx="${nx}" cy="${ny}" r="11" fill="${hue}" opacity=".3"/>` : ''}`
          + `<circle cx="${nx}" cy="${ny}" r="${i === 1 ? 6 : 4.6}" fill="${i === 1 ? hue : '#8FBBFF'}"/>`).join('');
    }
    return `<g transform="rotate(${rot} ${x + w / 2} ${y + h / 2})">
      <ellipse cx="${x + w / 2}" cy="${y + h + 12}" rx="${w * 0.42}" ry="14" fill="#000" opacity=".38" filter="url(#blur8)"/>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16" fill="url(#glass)" stroke="rgba(120,170,255,.55)" stroke-width="1.4"/>
      <rect x="${x + 1}" y="${y + 1}" width="${w - 2}" height="44" rx="15" fill="rgba(255,255,255,.05)"/>
      <rect x="${hx}" y="${hy}" width="46" height="8" rx="4" fill="rgba(255,255,255,.6)"/>
      <circle cx="${x + w - 24}" cy="${y + 20}" r="5" fill="${hue}"/>
      <circle cx="${x + w - 24}" cy="${y + 20}" r="10" fill="${hue}" opacity=".28"/>
      ${inner}
    </g>`;
  };

  // gradient orbit rings + haloed nodes
  const rings = [
    { rx: 158, ry: 48, rot: -16, op: .5, nodes: [[158, 0], [-100, 36]] },
    { rx: 224, ry: 70, rot: 12, op: .38, nodes: [[-224, 0], [156, -46]] },
    { rx: 288, ry: 98, rot: -6, op: .28, nodes: [[288, 0], [-198, 68]] },
  ].map((r) => {
    const nodes = r.nodes.map(([nx, ny], i) => {
      const col = i ? '#4C8DFF' : '#FFB23F';
      return `<circle cx="${cx + nx}" cy="${cy + ny}" r="14" fill="${col}" opacity=".25" filter="url(#blur6)"/>`
        + `<circle cx="${cx + nx}" cy="${cy + ny}" r="${i ? 5.5 : 7}" fill="${col}"/>`;
    }).join('');
    return `<g transform="rotate(${r.rot} ${cx} ${cy})" opacity="${r.op}">
        <ellipse cx="${cx}" cy="${cy}" rx="${r.rx}" ry="${r.ry}" fill="none" stroke="url(#ringG)" stroke-width="2"/>
      </g>${nodes}`;
  }).join('');

  // dashed link + a travelling spark midway, from each panel to the core
  const links = panels.map(([x, y, w, h, rot]) => {
    const px = x + w / 2, py = y + h / 2;
    const mx = (px + cx) / 2, my = (py + cy) / 2;
    return `<line x1="${px}" y1="${py}" x2="${cx}" y2="${cy}" stroke="#4C8DFF" stroke-width="1.5" stroke-dasharray="3 8" opacity=".4"/>`
      + `<circle cx="${mx}" cy="${my}" r="4" fill="#8FBBFF" filter="url(#blur6)"/>`;
  }).join('');

  // drifting particles (deterministic)
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const particles = Array.from({ length: 22 }, () => {
    const px = 18 + rnd() * (Wv - 36), py = 14 + rnd() * (Hv - 28), rr = 1 + rnd() * 2.6;
    const col = rnd() > .7 ? '#FFB23F' : '#8FBBFF';
    return `${rnd() > .7 ? `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${(rr * 3).toFixed(1)}" fill="${col}" opacity=".18" filter="url(#blur6)"/>` : ''}`
      + `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${rr.toFixed(1)}" fill="${col}" opacity="${(0.2 + rnd() * 0.55).toFixed(2)}"/>`;
  }).join('');

  return `<svg class="scene" viewBox="0 0 ${Wv} ${Hv}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs>
      <radialGradient id="vig" cx="50%" cy="46%"><stop offset="55%" stop-color="#0a1531" stop-opacity="0"/><stop offset="100%" stop-color="#03060f" stop-opacity=".8"/></radialGradient>
      <radialGradient id="neb1" cx="50%" cy="50%"><stop offset="0%" stop-color="#1E6BFF" stop-opacity=".5"/><stop offset="100%" stop-color="#1E6BFF" stop-opacity="0"/></radialGradient>
      <radialGradient id="neb2" cx="50%" cy="50%"><stop offset="0%" stop-color="#00C2FF" stop-opacity=".28"/><stop offset="100%" stop-color="#00C2FF" stop-opacity="0"/></radialGradient>
      <radialGradient id="floor" cx="50%" cy="50%"><stop offset="0%" stop-color="#1E6BFF" stop-opacity=".55"/><stop offset="100%" stop-color="#1E6BFF" stop-opacity="0"/></radialGradient>
      <radialGradient id="halo" cx="50%" cy="50%"><stop offset="0%" stop-color="#8FBBFF" stop-opacity=".9"/><stop offset="42%" stop-color="#1E6BFF" stop-opacity=".55"/><stop offset="100%" stop-color="#1E6BFF" stop-opacity="0"/></radialGradient>
      <!-- shaded sphere: light from top-left -->
      <radialGradient id="sph" cx="34%" cy="30%" r="78%">
        <stop offset="0%" stop-color="#6EA6FF"/><stop offset="38%" stop-color="#1E6BFF"/>
        <stop offset="78%" stop-color="#0b2a6b"/><stop offset="100%" stop-color="#06173f"/>
      </radialGradient>
      <linearGradient id="barG" x1="0" y1="1" x2="0" y2="0"><stop offset="0%" stop-color="#1E6BFF"/><stop offset="100%" stop-color="#9CC4FF"/></linearGradient>
      <linearGradient id="areaG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#FFB23F" stop-opacity=".7"/><stop offset="100%" stop-color="#FFB23F" stop-opacity="0"/></linearGradient>
      <linearGradient id="glass" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="rgba(24,52,108,.9)"/><stop offset="100%" stop-color="rgba(8,18,42,.86)"/></linearGradient>
      <linearGradient id="ringG" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#8FBBFF"/><stop offset="55%" stop-color="#1E6BFF"/><stop offset="100%" stop-color="#0b57d0"/></linearGradient>
      <filter id="blur6" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="6"/></filter>
      <filter id="blur8" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="9"/></filter>
      <filter id="spec" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="4"/></filter>
      <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter>
      <pattern id="grid" width="34" height="34" patternUnits="userSpaceOnUse"><path d="M34 0 H0 V34" fill="none" stroke="#4C8DFF" stroke-width=".8" opacity=".14"/></pattern>
    </defs>

    <rect width="${Wv}" height="${Hv}" fill="#0a1531"/>
    <rect width="${Wv}" height="${Hv}" fill="url(#grid)"/>
    <ellipse cx="${cx - 150}" cy="120" rx="260" ry="200" fill="url(#neb1)"/>
    <ellipse cx="${cx + 210}" cy="330" rx="240" ry="180" fill="url(#neb2)"/>
    <ellipse cx="${cx}" cy="${Hv - 34}" rx="320" ry="76" fill="url(#floor)"/>

    ${links}
    ${rings}
    ${panels.map(panelBody).join('')}

    <!-- glossy core -->
    <circle cx="${cx}" cy="${cy}" r="118" fill="url(#halo)" filter="url(#blur8)"/>
    <circle cx="${cx}" cy="${cy}" r="66" fill="url(#sph)"/>
    <ellipse cx="${cx - 22}" cy="${cy - 26}" rx="30" ry="20" fill="#fff" opacity=".5" filter="url(#spec)" transform="rotate(-24 ${cx - 22} ${cy - 26})"/>
    <path d="M ${cx - 52} ${cy + 34} A 62 62 0 0 0 ${cx + 44} ${cy + 50}" fill="none" stroke="#9CC4FF" stroke-width="3" opacity=".8" stroke-linecap="round"/>
    <circle cx="${cx}" cy="${cy}" r="46" fill="#08173a" opacity=".92"/>
    <circle cx="${cx}" cy="${cy}" r="46" fill="none" stroke="rgba(143,187,255,.7)" stroke-width="1.5"/>
    <g transform="translate(${cx} ${cy})" fill="none" stroke="#EAF1FF" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${g}</g>
    <!-- satellite on a small ring -->
    <g transform="rotate(-28 ${cx} ${cy})"><ellipse cx="${cx}" cy="${cy}" rx="88" ry="30" fill="none" stroke="rgba(143,187,255,.45)" stroke-width="1.5"/>
      <circle cx="${cx + 88}" cy="${cy}" r="16" fill="#FFB23F" opacity=".3" filter="url(#blur6)"/>
      <circle cx="${cx + 88}" cy="${cy}" r="7" fill="#FFD08A"/></g>

    ${particles}
    <rect width="${Wv}" height="${Hv}" fill="url(#vig)"/>
    <rect width="${Wv}" height="${Hv}" filter="url(#grain)" opacity=".05"/>
  </svg>`;
}

// ------------------------------------------------------------- composite
const label = (l) => `<div class="lbl"><span class="dot" style="background:${l.c};color:${l.c}"></span><span class="txt">${esc(l.t)}</span></div>`;

function htmlFor(a) {
  const m = meta(a.slug);
  // Keep every title on ONE line: step the size down as the split title grows,
  // so long comparison titles never wrap and squeeze the fixed-size stage.
  const full = `${a.pre} ${a.hl} ${a.post || ''}`.trim();
  const size = full.length <= 30 ? 72 : full.length <= 38 ? 64 : full.length <= 46 ? 58 : 52;
  const h1 = `${a.pre ? esc(a.pre) + ' ' : ''}<span class="hl">${esc(a.hl)}</span>${a.post ? ' ' + esc(a.post) : ''}`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:${W}px;height:${H}px;overflow:hidden;position:relative;
    background:linear-gradient(135deg,#050d22 0%,#08152f 46%,#0e2049 100%);
    color:#fff;font-family:"Segoe UI","Inter",system-ui,sans-serif}
  .glow{position:absolute;width:1150px;height:1150px;border-radius:50%;left:50%;top:-50%;
    transform:translateX(-50%);background:radial-gradient(circle,rgba(76,141,255,.30),transparent 62%)}
  .glow2{position:absolute;width:860px;height:860px;border-radius:50%;left:-18%;bottom:-34%;
    background:radial-gradient(circle,rgba(30,107,255,.26),transparent 60%)}
  .vign{position:absolute;inset:0;pointer-events:none;
    background:radial-gradient(ellipse at 50% 44%,transparent 52%,rgba(2,5,14,.62) 100%)}
  .wrap{position:relative;height:100%;display:flex;flex-direction:column;align-items:center;
    padding:46px 60px 34px}
  .eyebrow{display:flex;align-items:center;gap:12px;margin-bottom:20px;font-size:17px;font-weight:800;
    letter-spacing:.22em;text-transform:uppercase;color:#8FBBFF}
  .eyebrow .b{padding:7px 15px;border:1px solid rgba(76,141,255,.45);border-radius:999px;
    background:rgba(14,32,73,.7);color:#BBD3FF}
  .eyebrow .sep{width:7px;height:7px;border-radius:50%;background:#FFB23F}
  h1{font-size:${size}px;line-height:1.06;font-weight:800;letter-spacing:-.02em;text-align:center;
    text-shadow:0 8px 34px rgba(0,0,0,.55)}
  h1 .hl{color:#FFB23F;text-shadow:0 8px 34px rgba(0,0,0,.5)}
  .rule{width:132px;height:5px;border-radius:3px;margin-top:20px;
    background:linear-gradient(90deg,transparent,#4C8DFF,transparent)}
  .sub{display:flex;align-items:center;gap:14px;margin-top:18px;font-size:33px;font-weight:600;color:#E9EDF4}
  .sub .box{width:46px;height:46px;border-radius:12px;background:#0E2049;border:1px solid #24407a;
    display:flex;align-items:center;justify-content:center;box-shadow:0 6px 18px rgba(0,0,0,.4),inset 0 1px 0 rgba(255,255,255,.12)}
  .stage{flex:1;display:flex;align-items:center;justify-content:center;gap:30px;width:100%;margin-top:26px}
  .col{display:flex;flex-direction:column;gap:60px;flex:0 0 auto}
  .lbl{display:flex;align-items:center;gap:15px;max-width:330px;border-radius:15px;padding:17px 21px;
    background:linear-gradient(180deg,rgba(24,52,108,.72),rgba(9,20,46,.66));
    border:1px solid rgba(120,170,255,.34);
    box-shadow:0 12px 30px rgba(0,0,0,.4),inset 0 1px 0 rgba(255,255,255,.1)}
  .lbl .dot{width:14px;height:14px;border-radius:50%;flex:0 0 auto;
    box-shadow:0 0 14px currentColor,0 0 4px currentColor}
  .lbl .txt{font-size:25px;font-weight:700;line-height:1.16}
  .frame{flex:0 0 auto;width:720px;height:460px;border-radius:24px;overflow:hidden;position:relative;
    border:1px solid rgba(120,170,255,.5);box-shadow:0 30px 70px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.12)}
  .scene{display:block;width:720px;height:460px}
  .brand{display:flex;align-items:center;gap:12px;margin-top:6px;font-size:22px;font-weight:800;
    letter-spacing:.02em;color:#98A1B3}
  .brand i{color:#4C8DFF;font-style:normal}
  .chk{width:27px;height:27px}
</style></head><body>
  <div class="glow"></div><div class="glow2"></div>
  <div class="wrap">
    <div class="eyebrow"><span class="b">${esc(m.cat)}</span><span class="sep"></span><span>${m.mins} min read</span></div>
    <h1>${h1}</h1>
    <div class="rule"></div>
    <div class="sub"><span class="box"><svg class="chk" viewBox="0 0 32 32" fill="none"
      stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M7 17 l6 6 l12 -14"/></svg></span>${esc(a.sub)}</div>
    <div class="stage">
      <div class="col">${label(a.labels[0])}${label(a.labels[2])}</div>
      <div class="frame">${scene(a.glyph)}</div>
      <div class="col">${label(a.labels[1])}${label(a.labels[3])}</div>
    </div>
    <div class="brand">AIVO<i>X</i>FLOW<span style="color:#59627A;font-weight:600"> · Intelligence in Motion</span></div>
  </div>
  <div class="vign"></div>
</body></html>`;
}

// ---------------------------------------------------------------- render
const only = process.argv.indexOf('--slug');
const list = only > -1 ? HEROES.filter((h) => h.slug === process.argv[only + 1]) : HEROES;
if (!list.length) { console.error('No matching hero.'); process.exit(2); }
mkdirSync(outDir, { recursive: true });

const candidates = [
  path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
];
const browser = candidates.find((c) => existsSync(c));
if (!browser) { console.error('No Edge/Chrome found.'); process.exit(1); }

const port = 9484;
const udd = path.join(process.env.TEMP || '/tmp', `aivox-hero-${process.pid}`);
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

for (const a of list) {
  const target = path.join(outDir, `hero-${a.slug}.png`);
  const file = path.join(outDir, `hero-${a.slug}.html`);
  writeFileSync(file, htmlFor(a), 'utf8');
  const loaded = new Promise((r) => { onLoad = r; });
  await send('Page.navigate', { url: `file:///${file.replace(/\\/g, '/')}` });
  await Promise.race([loaded, new Promise((_, rej) => setTimeout(() => rej(new Error('load timeout')), 15000))]);
  await new Promise((r) => setTimeout(r, 250));
  const shot = await send('Page.captureScreenshot', {
    format: 'png', captureBeyondViewport: false,
    clip: { x: 0, y: 0, width: W, height: H, scale: 1 },
  });
  writeFileSync(target, Buffer.from(shot.data, 'base64'));
  try { rmSync(file, { force: true }); } catch { /* ignore */ }
  console.log(`write  ${path.relative(repo, target)}`);
}
process.exit(0);
