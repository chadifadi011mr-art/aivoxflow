// AIVOXFLOW editorial hero renderer — Approach C: AI art + text overlay.
//
// Why C: the operator reviewed Approach B (site/hero.mjs, pure vector art)
// and asked for real generated imagery instead of framed vector scenes.
// Here the background is a free Pollinations artwork stored per-article in
// docs/art/<slug>.jpg, and ALL typography is rendered by this engine as
// HTML — so titles stay spelled correctly (the original reason Approach A,
// full AI-generated heroes, was rejected: garbled text).
//
// Watermark: Pollinations' free tier stamps a bottom-right logo even with
// nologo=true. The canvas therefore shows a 1800px-wide, horizontally
// mirrored crop (visible original region ≈ x114..1024, y0..512 of the
// 1024x576 source) — the logo sits below the 900px cut line and never
// appears. Mirroring also moves the subject (usually left-of-centre) to the
// right, leaving the left third clear for the headline.
//
// Composition (no frames, no cards, no drop shadows — editorial overlay):
//   eyebrow (real category + real read time)   brand, same top row
//   big title, amber-highlighted key phrase
//   short amber rule, green check + subtitle
//   four labels as plain text with coloured dots, bottom row
// A layered navy scrim keeps every text zone legible over any artwork.
//
//   node site/hero-ai.mjs               # every article that has art
//   node site/hero-ai.mjs --slug <s>    # just one
//
// Emits docs/hero-ai-<slug>.png (1600x900) for operator review. Promoting
// into site/assets-src/ + rebuild + deploy remains a separate, explicitly
// approved step — nothing here touches production.
import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { renderHtml } from '../agents/lib/browser.mjs';
import { HEROES, esc, meta } from './hero-config.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(here, '..');
const artDir = path.join(repo, 'docs', 'art');
const outDir = path.join(repo, 'docs');
const W = 1600;
const H = 900;

// Per-article art options. `flip` mirrors the artwork horizontally — used
// when the generated subject sits on the LEFT, where the headline and the
// dark scrim go. Mirroring pushes it to the free right half instead.
const ART = {
  'choose-an-ai-writing-tool': { flip: false }, // robot already on the right
  'prompt-patterns-that-improve-output': { flip: true }, // typing hand was left
  // Staircase sits on the left of its frame, i.e. under the headline scrim.
  'map-the-task-before-automating': { flip: true },
  'compare-ai-tool-pricing': { flip: true }, // calculator was centre-left
  'ai-assistants-vs-traditional-software': { flip: true }, // robot head was centre-left
  'how-to-verify-ai-news': { flip: false }, // open page already on the right
};

// Inter, embedded as base64 so the render is identical locally and in CI
// (no dependence on OS-installed fonts or on temp-file relative paths).
const woff2 = (name) => readFileSync(path.join(repo, 'site', 'assets', 'fonts', name)).toString('base64');
const FONTS = {
  600: woff2('inter-latin-600-normal.woff2'),
  700: woff2('inter-latin-700-normal.woff2'),
  800: woff2('inter-latin-800-normal.woff2'),
};

function htmlFor(a) {
  const m = meta(a.slug);
  const art = readFileSync(path.join(artDir, `${a.slug}.jpg`)).toString('base64');
  const flip = (ART[a.slug] || {}).flip === true;
  // Mirroring about the element's centre would leave the (now right-hand)
  // subject half outside the 1600px canvas, so panned artworks also shift
  // left by exactly the 200px of horizontal overscan the 1800px art carries.
  const artTransform = flip ? 'transform:scaleX(-1);left:-200px' : '';
  const full = `${a.pre} ${a.hl} ${a.post || ''}`.trim();
  // Keep the headline on at most two lines: step the size down as it grows.
  const size = full.length <= 28 ? 74 : full.length <= 38 ? 66 : full.length <= 48 ? 58 : 52;
  const h1 = `${a.pre ? esc(a.pre) + ' ' : ''}<span class="hl">${esc(a.hl)}</span>${a.post ? ' ' + esc(a.post) : ''}`;
  const points = a.labels.map((l) =>
    `<div class="point"><i style="background:${l.c};box-shadow:0 0 12px ${l.c}66"></i>${esc(l.t)}</div>`).join('');
  const faces = Object.entries(FONTS)
    .map(([w, b64]) => `@font-face{font-family:Inter;src:url(data:font/woff2;base64,${b64}) format('woff2');font-weight:${w};font-style:normal;font-display:block}`)
    .join('\n');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${faces}
*{margin:0;padding:0;box-sizing:border-box}
body{width:${W}px;height:${H}px;overflow:hidden;position:relative;background:#050D1E;
  color:#fff;font-family:Inter,"Segoe UI",system-ui,sans-serif}
.art{position:absolute;top:0;left:0;width:1800px;height:auto;${artTransform};
  filter:saturate(1.06) contrast(1.04)}
.scrim{position:absolute;inset:0;background:
  linear-gradient(100deg,rgba(4,10,24,.97) 0%,rgba(4,10,24,.9) 30%,rgba(4,10,24,.5) 52%,rgba(4,10,24,.14) 74%,rgba(4,10,24,.03) 100%),
  linear-gradient(0deg,rgba(4,10,24,.92) 0%,rgba(4,10,24,.5) 14%,rgba(4,10,24,0) 30%),
  linear-gradient(180deg,rgba(4,10,24,.7) 0%,rgba(4,10,24,0) 15%)}
.wrap{position:absolute;inset:0;padding:74px 88px 66px;display:flex;flex-direction:column}
.top{display:flex;justify-content:space-between;align-items:center}
.eb{display:flex;align-items:center;gap:16px;font-size:19px;font-weight:800;
  letter-spacing:.26em;text-transform:uppercase}
.eb .cat{color:#9CC4FF}
.eb .dot{width:7px;height:7px;border-radius:50%;background:#FFB23F}
.eb .mins{color:#8FA6CC;letter-spacing:.2em}
.brand{font-size:20px;font-weight:800;letter-spacing:.16em;color:rgba(255,255,255,.6)}
.brand i{color:#4C8DFF;font-style:normal}
.mid{margin-top:70px;max-width:920px;flex:1}
h1{font-size:${size}px;line-height:1.08;font-weight:800;letter-spacing:-.015em}
h1 .hl{color:#FFB23F}
.rule{width:78px;height:5px;background:#FFB23F;margin-top:36px}
.sub{display:flex;align-items:center;gap:16px;margin-top:32px;font-size:32px;
  font-weight:600;color:#E9EDF4}
.sub svg{width:32px;height:32px;flex:0 0 auto}
.points{display:flex;justify-content:space-between;gap:26px;margin-top:auto}
.point{display:flex;align-items:center;gap:14px;font-size:26px;font-weight:700;
  color:#EAF1FF;white-space:nowrap}
.point i{width:13px;height:13px;border-radius:50%;flex:0 0 auto}
</style></head><body>
<img class="art" src="data:image/jpeg;base64,${art}" alt="">
<div class="scrim"></div>
<div class="wrap">
  <div class="top">
    <div class="eb"><span class="cat">${esc(m.cat)}</span><span class="dot"></span><span class="mins">${m.mins} min read</span></div>
    <div class="brand">AIVO<i>X</i>FLOW</div>
  </div>
  <div class="mid">
    <h1>${h1}</h1>
    <div class="rule"></div>
    <div class="sub"><svg viewBox="0 0 32 32" fill="none" stroke="#3DDC97" stroke-width="3.5"
      stroke-linecap="round" stroke-linejoin="round"><path d="M6 17 l7 7 l13 -15"/></svg>${esc(a.sub)}</div>
  </div>
  <div class="points">${points}</div>
</div>
</body></html>`;
}

const only = process.argv.indexOf('--slug');
const list = only > -1 ? HEROES.filter((h) => h.slug === process.argv[only + 1]) : HEROES;
if (!list.length) { console.error('No matching hero.'); process.exit(2); }

// `--publish` writes straight into the site source tree instead of docs/, and
// as JPEG: the committed heroes are what `npm run build` copies to dist/, and
// the JSON hero fields point at .jpg. Rendering PNG would add ~6 MB to a site
// whose current heroes are ~60 KB each, so the publish path re-encodes at
// quality 86 (the art is upscaled and soft, so it compresses well).
const publish = process.argv.includes('--publish');

mkdirSync(outDir, { recursive: true });
let rendered = 0;
for (const a of list) {
  const artFile = path.join(artDir, `${a.slug}.jpg`);
  if (!existsSync(artFile)) { console.log(`skip    ${a.slug} (no art in docs/art/)`); continue; }
  const target = publish
    ? path.join(repo, 'site', 'assets-src', 'articles', a.slug, 'hero.jpg')
    : path.join(outDir, `hero-ai-${a.slug}.png`);
  mkdirSync(path.dirname(target), { recursive: true });
  const r = await renderHtml(htmlFor(a), target, {
    width: W,
    height: H,
    format: publish ? 'jpeg' : 'png',
    ...(publish ? { quality: 86 } : {}),
  });
  console.log(`${publish ? 'publish' : 'write  '} ${path.relative(repo, target)} (${r.bytes} bytes)`);
  rendered++;
}
if (!rendered) { console.error('Nothing rendered — no art files matched.'); process.exit(1); }
process.exit(0);
