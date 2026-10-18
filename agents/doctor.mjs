#!/usr/bin/env node
// Configuration doctor.
//
//   node agents/doctor.mjs            # show config, check the key, list models
//   node agents/doctor.mjs --probe    # also run one tiny text call and one image
//
// It never prints the key — only whether it is present and how it is sent.
import { parseArgs } from 'node:util';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { listModels } from './lib/llm.mjs';
import { createImageProvider } from './lib/render-image.mjs';
import { findBrowser } from './lib/browser.mjs';

const { values: args } = parseArgs({ options: { probe: { type: 'boolean', default: false } }, allowPositionals: true });

const C = process.stdout.isTTY
  ? { dim: '\x1b[2m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', bold: '\x1b[1m', off: '\x1b[0m' }
  : { dim: '', red: '', green: '', yellow: '', bold: '', off: '' };

const env = (n, d = '') => (process.env[n] || d).trim();
const mask = (k) => (k ? `${k.slice(0, 4)}…${k.slice(-3)} (${k.length} chars)` : `${C.red}missing${C.off}`);

const llmProvider = env('AIVOXFLOW_AI_PROVIDER', 'mock').toLowerCase();
const llmModel = env('AIVOXFLOW_AI_MODEL');
const llmKey = env('AIVOXFLOW_AI_API_KEY');
const imgProvider = env('AIVOXFLOW_IMAGE_PROVIDER', 'local').toLowerCase();
const imgModel = env('AIVOXFLOW_IMAGE_MODEL');
const imgKey = env('AIVOXFLOW_IMAGE_API_KEY') || llmKey;
const searchProvider = env('AIVOXFLOW_SEARCH_PROVIDER', 'none');
const searchKey = env('AIVOXFLOW_SEARCH_API_KEY');

const KEYLESS_IMAGE = ['local', 'pollinations', 'a1111', 'automatic1111', 'sd'];
const IMG_DEFAULT = imgProvider === 'openai' ? 'gpt-image-1'
  : imgProvider === 'pollinations' ? 'flux'
    : imgProvider === 'a1111' || imgProvider === 'automatic1111' || imgProvider === 'sd' ? 'sd-local'
      : 'gemini-2.5-flash-image';
const imgModelShown = imgProvider === 'local' ? '(local renderer)' : (imgModel || IMG_DEFAULT);

console.log(`${C.bold}AIVOXFLOW content agents — configuration${C.off}\n`);
console.log(`  text      ${llmProvider.padEnd(12)} ${llmModel || `${C.yellow}(model unset)${C.off}`}`);
console.log(`            key ${llmProvider === 'ollama' || llmProvider === 'local' ? `${C.dim}not needed (local model)${C.off}` : mask(llmKey)}`);
console.log(`  images    ${imgProvider.padEnd(12)} ${imgModelShown}`);
console.log(`            key ${KEYLESS_IMAGE.includes(imgProvider) ? `${C.dim}not needed${C.off}` : mask(imgKey)}`);
const searchNote = searchProvider === 'none'
  ? `${C.yellow}(no provider — research will stop)${C.off}`
  : searchProvider === 'tavily' && !searchKey
    ? `${C.dim}keyless mode — free, rate-limited (a free key lifts the cap)${C.off}`
    : mask(searchKey);
console.log(`  search    ${searchProvider.padEnd(12)} ${searchNote}`);
console.log(`  browser   ${findBrowser() ? `${C.green}found${C.off} ${path.basename(findBrowser())}` : `${C.yellow}not found${C.off} (local images unavailable)`}`);

let problems = 0;

// ---------------------------------------------------------------- models
const isLocalLLM = llmProvider === 'ollama' || llmProvider === 'local';
if (llmProvider !== 'mock') {
  if (!isLocalLLM && !llmKey) {
    console.log(`\n${C.red}✗ AIVOXFLOW_AI_API_KEY is missing.${C.off}`);
    problems++;
  } else {
    try {
      const models = await listModels({
        provider: llmProvider,
        apiKey: llmKey,
        baseUrl: env('AIVOXFLOW_AI_BASE_URL') || undefined,
      });
      console.log(`\n${C.bold}${isLocalLLM ? 'Models installed in Ollama' : 'Models available to this key'}${C.off} (${models.length})`);
      const chat = models.filter((m) => m.methods.includes('generateContent') || m.methods.includes('chat'));
      for (const m of chat.slice(0, 40)) {
        const desc = m.description ? `  ${C.dim}${m.description}${C.off}` : '';
        console.log(`  ${m.id}${desc}`);
      }
      if (chat.length > 40) console.log(`  ${C.dim}… and ${chat.length - 40} more${C.off}`);

      if (!chat.length) {
        console.log(`  ${C.yellow}no chat model installed — run: ollama pull qwen2.5:14b${C.off}`);
        problems++;
      } else       if (llmModel && !models.some((m) => m.id === llmModel)) {
        console.log(`\n${C.red}✗ AIVOXFLOW_AI_MODEL="${llmModel}" is not in the list above.${C.off}`);
        problems++;
      } else if (llmModel) {
        console.log(`\n${C.green}✓${C.off} model "${llmModel}" is available`);

        // Asking for more context than the model supports fails at request time
        // with an opaque error — catch it here instead.
        const chosen = models.find((m) => m.id === llmModel);
        const want = Number(env('AIVOXFLOW_AI_NUM_CTX', '16384'));
        if (isLocalLLM && chosen?.context && want > chosen.context) {
          console.log(`  ${C.yellow}⚠ AIVOXFLOW_AI_NUM_CTX=${want} exceeds this model's ${chosen.context} context.${C.off}`);
          console.log(`    Set AIVOXFLOW_AI_NUM_CTX=${chosen.context} or you will get truncation or an error.`);
        }
        if (isLocalLLM) {
          const label = `${llmModel} ${chosen?.description || ''}`;
          const size = Number((label.match(/(\d+(?:\.\d+)?)\s*B\b/i) || [])[1] || 0);
          if (size && size < 14) {
            console.log(`  ${C.dim}A ${size}B model usually fails the long-form gates. Expect "needs review", not an article.${C.off}`);
            console.log(`  ${C.dim}For publishable drafts: ollama pull qwen2.5:14b (or larger).${C.off}`);
          }
        }
      }

      if (imgProvider === 'gemini' || imgProvider === 'google' || imgProvider === 'imagen') {
        const imageModels = models.filter((m) => /image|imagen/i.test(m.id));
        console.log(`\n${C.bold}Image-capable models${C.off} (${imageModels.length})`);
        for (const m of imageModels) console.log(`  ${m.id}  ${C.dim}${m.methods.join(', ')}${C.off}`);
        if (!imageModels.length) {
          console.log(`  ${C.yellow}none listed — image generation may not be enabled for this key/tier${C.off}`);
        }
      }
    } catch (e) {
      const hint = isLocalLLM ? ` Is Ollama running? (ollama serve)` : '';
      console.log(`\n${C.red}✗ Could not list models: ${e.message}${C.off}${hint}`);
      problems++;
    }
  }
}

// ---------------------------------------------------------------- local image services
if (imgProvider === 'a1111' || imgProvider === 'automatic1111' || imgProvider === 'sd') {
  const base = env('AIVOXFLOW_IMAGE_BASE_URL', 'http://127.0.0.1:7860');
  try {
    const res = await fetch(`${base}/sdapi/v1/sd-models`, { signal: AbortSignal.timeout(5000) });
    const list = res.ok ? await res.json() : [];
    console.log(`\n${C.green}✓${C.off} Stable Diffusion WebUI reachable at ${base} (${list.length} checkpoint(s))`);
    if (!list.length) console.log(`  ${C.yellow}no checkpoint loaded — download an SDXL model in the WebUI first${C.off}`);
  } catch {
    console.log(`\n${C.red}✗ Cannot reach Stable Diffusion at ${base}.${C.off}`);
    console.log(`  Start it with: webui-user.bat --api --listen --port 7860`);
    problems++;
  }
}

if (imgProvider === 'pollinations') {
  console.log(`\n${C.dim}Pollinations needs no key. It is best-effort and rate-limited; images may be retried.${C.off}`);
}

// ---------------------------------------------------------------- probe
if (args.probe) {
  console.log(`\n${C.bold}Probe${C.off}`);
  if (llmProvider !== 'mock') {
    try {
      const { createLLM } = await import('./lib/llm.mjs');
      const llm = createLLM(() => {});
      const t0 = Date.now();
      const { data } = await llm.run({
        task: 'probe',
        system: 'You are a health check. Reply with JSON only.',
        user: '<input>{"ping":true}</input>',
      });
      console.log(`  ${C.green}✓${C.off} text call ok in ${Date.now() - t0}ms → ${JSON.stringify(data).slice(0, 80)}`);
    } catch (e) {
      console.log(`  ${C.red}✗ text call failed: ${e.message.slice(0, 200)}${C.off}`);
      problems++;
    }
  }

  try {
    const img = createImageProvider(() => {});
    const out = path.join(process.env.TEMP || '/tmp', `aivox-probe-${Date.now()}`);
    const t0 = Date.now();
    const r = await img.generate({
      prompt: 'Minimal abstract editorial artwork, deep navy background, electric blue geometric flow lines, no text, 16:9',
      seed: 'probe',
      motif: 'ai-tools',
      outPathBase: out,
      width: 1600,
      height: 900,
    });
    console.log(`  ${C.green}✓${C.off} image ok in ${Date.now() - t0}ms → ${path.basename(r.path)} ${Math.round(r.bytes / 1024)}KB ${r.width}×${r.height}`);
    try { rmSync(r.path, { force: true }); } catch { /* ignore */ }
  } catch (e) {
    console.log(`  ${C.red}✗ image failed: ${e.message.slice(0, 200)}${C.off}`);
    problems++;
  }
}

console.log(`\n${problems ? `${C.red}${problems} problem(s)${C.off}` : `${C.green}All checks passed${C.off}`}`);
process.exit(problems ? 1 : 0);
