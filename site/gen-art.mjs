// Generate hero artwork (Approach C) for articles missing docs/art/<slug>.jpg.
//
// Free Pollinations endpoint: no key, but the free tier allows ~1 image per
// 45 seconds per IP and intermittently answers 402/503 — so requests are
// serial, spaced ~50s apart, with bounded retries and a hard per-request
// timeout. Prompts are written per-article: subject on the RIGHT, the LEFT
// half kept dark and empty for the editorial headline, and NO text inside
// the image (typography is always rendered by site/hero-ai.mjs).
//
//   node site/gen-art.mjs            # every article that lacks art
//   node site/gen-art.mjs --force    # regenerate everything
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(here, '..');
const artDir = path.join(repo, 'docs', 'art');

// Default look shared by every artwork. A PROMPTS entry may override it by
// using `{ prompt, style }` instead of a bare string — needed when the shared
// "3D render, deep navy" recipe fights the subject (a whiteboard scene, for
// instance, comes back as a blue blob under the default style).
const STYLE = 'premium 3D render, cinematic studio lighting, deep navy background, '
  + 'electric blue glow with warm amber accents, floating particles, sharp focus, high detail, '
  + 'subject placed on the right side, entire left half dark and empty space for text, '
  + 'no text, no words, no letters, no numbers, no watermark';

// Bright whiteboard scenes read as mush under STYLE, so this one gets a
// photographic recipe with the same left/right framing contract.
const PHOTO_STYLE = 'professional editorial photograph, bright even lighting, crisp sharp focus, '
  + 'high detail, subject placed on the right side, left half darker and free of clutter, '
  + 'no readable text, no words, no letters, no watermark';

const PROMPTS = {
  'prompt-patterns-that-improve-output':
    'a humanoid robot hand typing on a glowing keyboard, neat holographic building blocks '
    + 'stacking into a structure above the desk',
  // Failures documented: "shallow depth of field" blurred the whole frame;
  // an abstract "glowing flowchart" came back as a blue ellipse; a
  // "whiteboard with boxes" rendered as a cardboard box. Abstract process
  // nouns are unreliable — a literal staircase of steps is not.
  'map-the-task-before-automating':
    'a grand staircase of wide separate steps rising upward, each tread edge lit with warm '
    + 'amber light, deep navy surroundings, dramatic side lighting, crisp sharp focus',
  // Concrete physical objects only, one clear scene per prompt. Every
  // abstract phrasing tried so far ("an assistant facing software", "a
  // holographic browser window") came back as a blob or a single unrelated
  // object, so each prompt names real, photographable things.
  'ai-assistants-vs-traditional-software':
    'a shiny chrome humanoid robot head on a desk facing an old beige CRT computer monitor, '
    + 'face to face, dramatic rim lighting, dark background',
  'how-to-verify-ai-news':
    'a metal magnifying glass lying across an open newspaper page under a warm desk lamp, '
    + 'close up photograph, shallow depth of field',
  'browser-based-vs-installed-ai-tools': {
    prompt: 'a modern open laptop and a desktop computer tower standing side by side on a '
      + 'clean desk, bright studio product photography, soft even lighting, crisp detail',
    // Overrides STYLE: "bright studio lighting" contradicts its deep navy
    // cinematic recipe, and the default made this scene come back too dark.
    style: PHOTO_STYLE,
  },
  'compare-ai-tool-pricing':
    'a glossy calculator with a blank dark screen showing no characters, floating blank price '
    + 'tag cards, stacked gold coins, pricing comparison scene on a dark reflective surface',
};

const force = process.argv.includes('--force');
mkdirSync(artDir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function gen(slug, prompt, style = STYLE) {
  const url = 'https://image.pollinations.ai/prompt/'
    + encodeURIComponent(`${prompt}, ${style}`)
    + `?width=1024&height=576&nologo=true&model=turbo&seed=${4000 + slug.length * 37}`;
  let lastErr = 'unknown';
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(240000) });
      if (!res.ok) { lastErr = `HTTP ${res.status}`; throw new Error(lastErr); }
      const buf = Buffer.from(await res.arrayBuffer());
      // Pollinations answers JSON errors with 200 sometimes — validate a JPEG.
      if (buf.length < 10240 || buf[0] !== 0xff || buf[1] !== 0xd8) {
        lastErr = `not a jpeg (${buf.length} bytes)`;
        throw new Error(lastErr);
      }
      return buf;
    } catch (e) {
      lastErr = e.message;
      if (attempt < 3) { console.log(`  retry ${slug} (${lastErr}), waiting 50s...`); await sleep(50000); }
    }
  }
  throw new Error(lastErr);
}

const list = Object.entries(PROMPTS).filter(([slug]) => force || !existsSync(path.join(artDir, `${slug}.jpg`)));
if (!list.length) { console.log('All artwork already present.'); process.exit(0); }

console.log(`Generating ${list.length} artworks (serial, ~50s spacing)...`);
let ok = 0;
const failed = [];
for (const [slug, entry] of list) {
  const prompt = typeof entry === 'string' ? entry : entry.prompt;
  const style = typeof entry === 'string' ? STYLE : entry.style;
  const t0 = Date.now();
  try {
    const buf = await gen(slug, prompt, style);
    writeFileSync(path.join(artDir, `${slug}.jpg`), buf);
    ok++;
    console.log(`art     ${slug}.jpg (${buf.length} bytes, ${Math.round((Date.now() - t0) / 1000)}s)`);
  } catch (e) {
    failed.push(slug);
    console.error(`FAIL    ${slug}: ${e.message}`);
  }
  if (list.indexOf([slug, entry]) < list.length - 1) await sleep(50000);
}
console.log(`Done: ${ok} ok, ${failed.length} failed${failed.length ? ` (${failed.join(', ')})` : ''}`);
process.exit(failed.length ? 1 : 0);
