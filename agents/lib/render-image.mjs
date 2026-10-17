// Image provider for article artwork.
//
// AIVOXFLOW_IMAGE_PROVIDER:
//   local   (default) — deterministic, branded editorial artwork rendered with
//                       the local browser. No API, no cost, no stock photos.
//                       It does NOT follow the prompt semantically; it encodes
//                       the article's seed into a house-style composition.
//   openai            — /v1/images/generations, prompt-following, needs a key.
//
// The pipeline always produces a real 16:9 PNG with intrinsic dimensions, so the
// article never ships with a missing or placeholder image.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { renderHtml, findBrowser } from './browser.mjs';
import { repo } from './job.mjs';
import { imageSize } from '../../site/lib/imagesize.mjs';

const env = (n, d = '') => (process.env[n] || d).trim();
const numEnv = (n, d) => {
  const v = Number(process.env[n]);
  return Number.isFinite(v) && String(process.env[n] || '').trim() !== '' ? v : d;
};

const hash = (s) => {
  let h = 2166136261;
  for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
};
const rng = (seed) => () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// ---------------------------------------------------------------- local art
// Category slug → visual motif. Each encodes the shape of the argument rather
// than illustrating the literal subject — house style, not stock photography.
const MOTIFS = {
  'ai-tools': 'planes',
  tutorials: 'path',
  'software-web': 'windows',
  'automation-agents': 'graph',
  'ai-news': 'wave',
  comparisons: 'split',
};

function motif(name, W, H, r) {
  const key = MOTIFS[name] || name;
  const cx = W / 2;
  const cy = H / 2;

  if (key === 'path') {
    const pts = Array.from({ length: 5 }, (_, i) => [W * (0.12 + i * 0.19), H * (0.78 - i * 0.13)]);
    const line = pts.map((p, i) => `${i ? 'L' : 'M'} ${p[0].toFixed(0)} ${p[1].toFixed(0)}`).join(' ');
    return `<path d="${line}" fill="none" stroke="#4C8DFF" stroke-width="3" opacity=".85"/>
      <path d="${line}" fill="none" stroke="#4C8DFF" stroke-width="10" opacity=".10"/>
      ${pts.map((p, i) => `<circle cx="${p[0].toFixed(0)}" cy="${p[1].toFixed(0)}" r="${i === pts.length - 1 ? 16 : 9}" fill="${i === pts.length - 1 ? '#7FB0FF' : '#08152F'}" stroke="#4C8DFF" stroke-width="3"/>`).join('')}
      <path d="M ${W * 0.86} ${H * 0.22} L ${W * 0.94} ${H * 0.22}" stroke="#4C8DFF" stroke-width="2" opacity=".35" stroke-dasharray="6 10"/>`;
  }

  if (key === 'windows') {
    const win = (x, y, w, h, o) => `<g opacity="${o}">
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="18" fill="rgba(12,30,66,.55)" stroke="#4C8DFF" stroke-width="2"/>
      <line x1="${x}" y1="${y + 46}" x2="${x + w}" y2="${y + 46}" stroke="#4C8DFF" stroke-width="1.5" opacity=".55"/>
      <circle cx="${x + 26}" cy="${y + 23}" r="5" fill="#4C8DFF" opacity=".8"/>
      <circle cx="${x + 46}" cy="${y + 23}" r="5" fill="#4C8DFF" opacity=".45"/>
      <circle cx="${x + 66}" cy="${y + 23}" r="5" fill="#4C8DFF" opacity=".25"/>
    </g>`;
    return `${win(W * 0.10, H * 0.24, W * 0.42, H * 0.46, 0.55)}${win(W * 0.38, H * 0.36, W * 0.42, H * 0.46, 0.95)}`;
  }

  if (key === 'graph') {
    // Fixed constellation: balanced on purpose. Random node placement produced
    // clustered, lopsided artwork, which reads as broken rather than designed.
    const P = [
      [0.16, 0.34], [0.31, 0.20], [0.47, 0.31], [0.63, 0.19], [0.80, 0.33],
      [0.26, 0.66], [0.42, 0.78], [0.58, 0.62], [0.74, 0.74], [0.88, 0.56],
    ];
    const nodes = P.map(([x, y]) => [W * x, H * y]);
    const edges = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [8, 9], [2, 7], [4, 9], [1, 5]];
    const hub = 7;
    return `${edges.map(([a, b]) => `<line x1="${nodes[a][0].toFixed(0)}" y1="${nodes[a][1].toFixed(0)}" x2="${nodes[b][0].toFixed(0)}" y2="${nodes[b][1].toFixed(0)}" stroke="#4C8DFF" stroke-width="1.6" opacity=".40"/>`).join('')}
      ${nodes.map((p, i) => `<circle cx="${p[0].toFixed(0)}" cy="${p[1].toFixed(0)}" r="${i === hub ? 13 : 6.5}" fill="${i === hub ? '#9CC4FF' : '#08152F'}" stroke="#4C8DFF" stroke-width="${i === hub ? 2 : 2.4}"/>`).join('')}
      <circle cx="${nodes[hub][0].toFixed(0)}" cy="${nodes[hub][1].toFixed(0)}" r="34" fill="none" stroke="#4C8DFF" stroke-width="1.4" opacity=".45"/>
      <circle cx="${nodes[hub][0].toFixed(0)}" cy="${nodes[hub][1].toFixed(0)}" r="58" fill="none" stroke="#4C8DFF" stroke-width="1" opacity=".20"/>`;
  }

  if (key === 'wave') {
    const wave = (amp, yOff, op, w) => {
      const steps = 40;
      const d = Array.from({ length: steps + 1 }, (_, i) => {
        const x = (W / steps) * i;
        const y = cy + yOff + Math.sin((i / steps) * Math.PI * 2.4 + r() * 0.2) * amp;
        return `${i ? 'L' : 'M'} ${x.toFixed(0)} ${y.toFixed(0)}`;
      }).join(' ');
      return `<path d="${d}" fill="none" stroke="#4C8DFF" stroke-width="${w}" opacity="${op}" stroke-linecap="round"/>`;
    };
    return `${wave(H * 0.20, -H * 0.10, 0.22, 2)}${wave(H * 0.14, 0, 0.55, 3)}${wave(H * 0.09, H * 0.10, 0.9, 4)}`;
  }

  if (key === 'split') {
    // Two columns of bars either side of an axis: the visual grammar of a
    // comparison table, without pretending to show real data.
    const rows = 4;
    const bars = Array.from({ length: rows }, (_, i) => {
      const y = H * (0.28 + i * 0.115);
      const lw = W * (0.15 + r() * 0.10);
      const rw = W * (0.13 + r() * 0.10);
      const op = (0.75 - i * 0.13).toFixed(2);
      return `<rect x="${(cx - 34 - lw).toFixed(0)}" y="${y.toFixed(0)}" width="${lw.toFixed(0)}" height="16" rx="8" fill="#1E6BFF" opacity="${op}"/>
        <rect x="${(cx + 34).toFixed(0)}" y="${y.toFixed(0)}" width="${rw.toFixed(0)}" height="16" rx="8" fill="none" stroke="#4C8DFF" stroke-width="1.8" opacity="${op}"/>`;
    }).join('');
    return `<line x1="${cx}" y1="${H * 0.18}" x2="${cx}" y2="${H * 0.84}" stroke="#4C8DFF" stroke-width="1.2" opacity=".35" stroke-dasharray="4 8"/>
      ${bars}`;
  }

  // 'planes' — default
  return `<g transform="translate(${cx} ${cy}) rotate(${(r() * 12 - 6).toFixed(1)})">
    ${[0, 1, 2].map((i) => `<rect x="${-W * 0.20 + i * W * 0.045}" y="${-H * 0.16 + i * H * 0.05}" width="${W * 0.40}" height="${H * 0.34}" rx="22"
      fill="rgba(30,107,255,${(0.06 + i * 0.05).toFixed(2)})" stroke="#4C8DFF" stroke-width="2" opacity="${(0.45 + i * 0.2).toFixed(2)}"/>`).join('')}
    <path d="M ${-W * 0.14} ${H * 0.08} L ${W * 0.16} ${-H * 0.10}" stroke="#7FB0FF" stroke-width="3" opacity=".9"/>
  </g>`;
}

function localHtml({ seed, width, height, motif: motifName = 'planes' }) {
  const r = rng(hash(seed));
  const W = width;
  const H = height;

  const curves = Array.from({ length: 4 }, (_, i) => {
    const y0 = H * (0.15 + r() * 0.7);
    const y1 = H * (0.15 + r() * 0.7);
    const y2 = H * (0.15 + r() * 0.7);
    const y3 = H * (0.15 + r() * 0.7);
    return `<path d="M ${-W * 0.1} ${y0} C ${W * 0.25} ${y1}, ${W * 0.6} ${y2}, ${W * 1.1} ${y3}"
      fill="none" stroke="#4C8DFF" stroke-width="${(1.5 + r() * 3).toFixed(2)}"
      stroke-linecap="round" opacity="${(0.06 + i * 0.05).toFixed(2)}"/>`;
  }).join('');

  const specks = Array.from({ length: 14 }, () => {
    const x = W * (0.08 + r() * 0.84);
    const y = H * (0.12 + r() * 0.76);
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(1 + r() * 3).toFixed(1)}" fill="#7FB0FF" opacity="${(0.15 + r() * 0.35).toFixed(2)}"/>`;
  }).join('');

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{margin:0;padding:0}
    html,body{width:${W}px;height:${H}px;overflow:hidden;background:#08152F}
    .stage{position:relative;width:100%;height:100%;
      background:linear-gradient(135deg,#06122A 0%,#0B1E42 52%,#102A5C 100%)}
    .glow{position:absolute;right:-18%;top:-45%;width:${W * 0.8}px;height:${W * 0.8}px;border-radius:50%;
      background:radial-gradient(circle,rgba(76,141,255,.34),transparent 62%)}
    .glow2{position:absolute;left:-20%;bottom:-55%;width:${W * 0.7}px;height:${W * 0.7}px;border-radius:50%;
      background:radial-gradient(circle,rgba(30,107,255,.18),transparent 65%)}
    svg{position:absolute;inset:0}
    .grid{position:absolute;inset:0;opacity:.5;
      background-image:linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),
                       linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px);
      background-size:48px 48px}
    .vignette{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 45%,transparent 40%,rgba(3,8,20,.55) 100%)}
  </style></head><body>
    <div class="stage">
      <div class="glow"></div><div class="glow2"></div><div class="grid"></div>
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
        ${curves}${specks}${motif(motifName, W, H, r)}
      </svg>
      <div class="vignette"></div>
    </div>
  </body></html>`;
}

// ---------------------------------------------------------------- provider
// `outPathBase` has no extension: the provider writes the real file and reports
// which one it produced, because Gemini may return PNG while OpenAI returns PNG
// and the local renderer returns JPEG.
const EXT_BY_MIME = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/webp': 'webp',
};

function writeImage(base, buf, mime) {
  const ext = EXT_BY_MIME[mime] || 'png';
  const file = `${base}.${ext}`;
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, buf);
  const size = imageSize(file) || {};
  return { path: file, ext, bytes: buf.length, width: size.width || 0, height: size.height || 0 };
}

export function createImageProvider(log = () => {}) {
  const provider = env('AIVOXFLOW_IMAGE_PROVIDER', 'local').toLowerCase();
  const key = env('AIVOXFLOW_IMAGE_API_KEY') || env('AIVOXFLOW_AI_API_KEY');
  const defaultModel = provider === 'openai' ? 'gpt-image-1'
    : provider === 'pollinations' ? 'flux'
      : provider === 'a1111' || provider === 'automatic1111' || provider === 'sd' ? 'sd-local'
        : 'gemini-2.5-flash-image';
  const model = env('AIVOXFLOW_IMAGE_MODEL', defaultModel);
  const baseUrl = env('AIVOXFLOW_IMAGE_BASE_URL',
    provider === 'openai' ? 'https://api.openai.com' : 'https://generativelanguage.googleapis.com');

  async function local({ seed, outPathBase, width, height, motif: m }) {
    if (!findBrowser()) {
      throw new Error('Local image rendering needs Edge or Chrome. Set AIVOXFLOW_BROWSER, or configure a hosted provider.');
    }
    // JPEG: gradient-heavy artwork compresses ~8× better than PNG at visually
    // identical quality, and the browser never has to decode a megabyte.
    const file = `${outPathBase}.jpg`;
    const { bytes } = await renderHtml(localHtml({ seed, width, height, motif: m }), file,
      { width, height, format: 'jpeg', quality: 88 });
    return { path: file, ext: 'jpg', bytes, width, height };
  }

  async function openai({ prompt, outPathBase }) {
    if (!key) throw new Error('AIVOXFLOW_IMAGE_API_KEY is required for AIVOXFLOW_IMAGE_PROVIDER=openai.');
    const res = await fetch(`${baseUrl}/v1/images/generations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, prompt, size: '1536x1024', n: 1 }),
    });
    if (!res.ok) throw new Error(`image API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) throw new Error('Image API returned no b64_json payload.');
    return writeImage(outPathBase, Buffer.from(b64, 'base64'), 'image/png');
  }

  // Gemini / Imagen on Google AI Studio.
  //   imagen-*        → :predict
  //   gemini-*-image  → :generateContent with an image modality
  // Some models reject responseModalities or imageConfig; each rejected field is
  // dropped and retried once, so a model rename never means editing code.
  async function gemini({ prompt, outPathBase }) {
    if (!key) throw new Error('AIVOXFLOW_IMAGE_API_KEY (or AIVOXFLOW_AI_API_KEY) is required for the Gemini image provider.');
    const isImagen = /^imagen/i.test(model);

    if (isImagen) {
      const res = await fetch(`${baseUrl}/v1beta/models/${encodeURIComponent(model)}:predict`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          instances: [{ prompt }],
          parameters: { sampleCount: 1, aspectRatio: '16:9' },
        }),
      });
      if (!res.ok) throw new Error(`Imagen ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const data = await res.json();
      const p = data.predictions?.[0];
      const b64 = p?.bytesBase64Encoded;
      if (!b64) throw new Error('Imagen returned no image payload.');
      return writeImage(outPathBase, Buffer.from(b64, 'base64'), p.mimeType || 'image/png');
    }

    const configs = [
      { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '16:9' } },
      { responseModalities: ['IMAGE'] },
      { responseModalities: ['TEXT', 'IMAGE'] },
      {},
    ];
    let lastError = null;
    for (const generationConfig of configs) {
      const res = await fetch(`${baseUrl}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const parts = data.candidates?.[0]?.content?.parts || [];
        const inline = parts.find((p) => p.inlineData || p.inline_data);
        const payload = inline?.inlineData || inline?.inline_data;
        if (payload?.data) {
          return writeImage(outPathBase, Buffer.from(payload.data, 'base64'), payload.mimeType || payload.mime_type || 'image/png');
        }
        lastError = new Error(`Gemini returned no image (finishReason: ${data.candidates?.[0]?.finishReason || 'unknown'}).`);
        continue;
      }
      const body = await res.text();
      lastError = new Error(`Gemini ${res.status}: ${body.slice(0, 300)}`);
      if (res.status !== 400) break; // only a 400 is worth retrying with less config
    }
    throw lastError;
  }

  // Pollinations: free, no key, no install. Quality is "good enough for a hero"
  // and the service is best-effort, so it is retried and never trusted blindly.
  async function pollinations({ prompt, outPathBase, width, height }) {
    const base = env('AIVOXFLOW_IMAGE_BASE_URL', 'https://image.pollinations.ai');
    const model = env('AIVOXFLOW_IMAGE_MODEL', 'flux');
    const seed = Math.floor(Math.random() * 1e9);
    const url = `${base}/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}`
      + `&model=${encodeURIComponent(model)}&nologo=true&seed=${seed}`;
    let lastErr = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(120000) });
        if (!res.ok) throw new Error(`pollinations ${res.status}: ${(await res.text()).slice(0, 160)}`);
        const ctype = res.headers.get('content-type') || '';
        if (!ctype.startsWith('image/')) throw new Error(`pollinations returned ${ctype || 'no content-type'}`);
        const buf = Buffer.from(await res.arrayBuffer());
        // The service sometimes answers with a 1×1 placeholder instead of an
        // error. Treat anything that small as a failure and retry.
        const probe = writeImage(`${outPathBase}.probe`, buf, ctype);
        const tiny = !probe.width || probe.width <= 2 || probe.height <= 2;
        try { rmSync(probe.path, { force: true }); } catch { /* ignore */ }
        if (tiny || buf.length < 512) throw new Error('pollinations returned an empty or placeholder image');
        return writeImage(outPathBase, buf, ctype);
      } catch (e) {
        lastErr = e;
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      }
    }
    throw lastErr;
  }

  // Automatic1111 / Forge / SD.Next: local Stable Diffusion over HTTP.
  // Unlimited, free, private — the only option that never rate-limits.
  async function a1111({ prompt, outPathBase, width, height }) {
    const base = env('AIVOXFLOW_IMAGE_BASE_URL', 'http://127.0.0.1:7860');
    const negative = env('AIVOXFLOW_IMAGE_NEGATIVE',
      'text, words, letters, watermark, logo, signature, blurry, low quality, people, faces, deformed');
    const res = await fetch(`${base}/sdapi/v1/txt2img`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        prompt: `${prompt}, editorial illustration, abstract, deep navy background, electric blue accents, no text`,
        negative_prompt: negative,
        width, height,
        steps: numEnv('AIVOXFLOW_IMAGE_STEPS', 28),
        cfg_scale: numEnv('AIVOXFLOW_IMAGE_CFG', 6.5),
        sampler_name: env('AIVOXFLOW_IMAGE_SAMPLER', 'DPM++ 2M Karras'),
      }),
      signal: AbortSignal.timeout(180000),
    });
    if (!res.ok) throw new Error(`A1111 ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    const b64 = data.images?.[0];
    if (!b64) throw new Error('A1111 returned no image (is the WebUI running with --api?)');
    return writeImage(outPathBase, Buffer.from(b64.replace(/^data:image\/\w+;base64,/, ''), 'base64'), 'image/png');
  }

  return {
    provider,
    model,
    async generate({ prompt, seed, outPathBase, width = 1600, height = 900, motif }) {
      log(`  image: ${provider}${provider === 'local' ? '' : ` (${model})`} → ${path.basename(outPathBase)}`);
      const run = provider === 'openai' ? openai
        : provider === 'gemini' || provider === 'google' || provider === 'imagen' ? gemini
          : provider === 'pollinations' ? pollinations
            : provider === 'a1111' || provider === 'automatic1111' || provider === 'sd' ? a1111
              : local;
      const out = await run({ prompt, seed: seed || prompt, outPathBase, width, height, motif });
      return { ...out, provider };
    },
  };
}

// Where artwork for a given slug lives.
// Drafts keep their images under content/drafts/assets/ so an unpublished run
// never pollutes the site's asset tree; promotion copies them across.
export const draftAssetDir = (slug) => path.join(repo, 'content', 'drafts', 'assets', slug);
export const articleAssetDir = (slug) => path.join(repo, 'site', 'assets-src', 'articles', slug);
export const articleAssetUrl = (slug, file) => `/assets/articles/${slug}/${file}`;
export const assetExists = (p) => existsSync(p);
