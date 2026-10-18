// Provider contract tests — no network, no keys, no GPU.
//
// A local stub speaks the wire format of every free back end so the adapters can
// be verified before anyone installs anything: Gemini, Ollama, Imagen, A1111 and
// Pollinations. It proves request shape, auth handling, JSON mode, image
// extraction and the config-downgrade fallback.
//
// Usage: node tests/providers.mjs
import http from 'node:http';
import { readFileSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(root, '..');

let failures = 0;
let checks = 0;
const ok = (name, cond, detail = '') => {
  checks++;
  if (cond) console.log(`PASS  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
};

// A real PNG so the dimension reader has something to parse.
const PNG = readFileSync(path.join(repo, 'brand', 'icons', 'favicon-32.png'));
const PNG_B64 = PNG.toString('base64');

const seen = [];
let geminiConfigAttempts = 0;
let flakyAttempts = 0;

const server = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const raw = Buffer.concat(chunks);
    const url = req.url;
    let body = null;
    try { body = raw.length ? JSON.parse(raw.toString('utf8')) : null; } catch { body = null; }
    seen.push({ method: req.method, url, headers: req.headers, body });

    const json = (code, obj) => {
      res.writeHead(code, { 'content-type': 'application/json' });
      res.end(JSON.stringify(obj));
    };

    // ---- Ollama
    if (url === '/api/tags') {
      return json(200, { models: [{ name: 'qwen2.5:14b', details: { parameter_size: '14.8B', family: 'qwen2' } }] });
    }
    if (url === '/api/chat') {
      return json(200, {
        message: { content: '{"ok":true,"echo":"local"}' },
        prompt_eval_count: 21, eval_count: 9, done: true,
      });
    }

    // ---- Gemini
    if (req.method === 'GET' && url.startsWith('/v1beta/models')) {
      return json(200, {
        models: [
          { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/gemini-2.5-flash-image', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/imagen-4.0-generate-001', supportedGenerationMethods: ['predict'] },
        ],
      });
    }
    if (url.includes(':predict')) {
      return json(200, { predictions: [{ bytesBase64Encoded: PNG_B64, mimeType: 'image/png' }] });
    }
    if (url.includes(':generateContent')) {
      const wantsImage = JSON.stringify(body?.generationConfig || {}).includes('IMAGE');
      if (wantsImage) {
        if (body.generationConfig.imageConfig && geminiConfigAttempts++ === 0) {
          return json(400, { error: { code: 400, message: 'imageConfig is not supported by this model' } });
        }
        return json(200, {
          candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: PNG_B64 } }] }, finishReason: 'STOP' }],
        });
      }
      const userText = (body?.contents || []).map((c) => (c.parts || []).map((p) => p.text || '').join('')).join('');
      if (userText.includes('MODE:truncate')) {
        return json(200, {
          candidates: [{ content: { parts: [{ text: '{"claims":[{"te' }] }, finishReason: 'MAX_TOKENS' }],
          usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 900 },
        });
      }
      if (userText.includes('MODE:flaky')) {
        if (flakyAttempts++ === 0) {
          return json(200, {
            candidates: [{ content: { parts: [{ text: 'this is not JSON' }] }, finishReason: 'STOP' }],
            usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 7 },
          });
        }
        return json(200, {
          candidates: [{ content: { parts: [{ text: '{"ok":true,"flaky":"recovered"}' }] }, finishReason: 'STOP' }],
          usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 7 },
        });
      }
      return json(200, {
        candidates: [{ content: { parts: [{ text: '{"ok":true,"echo":"hello"}' }] }, finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 7 },
      });
    }

    // ---- Automatic1111
    if (url === '/sdapi/v1/txt2img') {
      return json(200, { images: [PNG_B64], info: '{}' });
    }
    if (url === '/sdapi/v1/sd-models') {
      return json(200, [{ title: 'sdxl.safetensors' }]);
    }

    // ---- Pollinations (returns bytes, not JSON)
    if (url.startsWith('/prompt/')) {
      res.writeHead(200, { 'content-type': 'image/png' });
      return res.end(PNG);
    }

    // ---- Tavily search (JSON, keyed or keyless)
    if (req.method === 'POST' && url === '/search') {
      return json(200, {
        results: [{ title: 'Stub result', url: 'https://example.com/a', content: 'snippet text', score: 0.9 }],
        response_time: 0.1,
      });
    }

    return json(404, {});
  });
});

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const tmp = path.join(process.env.TEMP || '/tmp', `aivox-provider-${Date.now()}`);

const { createLLM, listModels } = await import('../agents/lib/llm.mjs');
const { createImageProvider } = await import('../agents/lib/render-image.mjs');
const { createSearch } = await import('../agents/lib/search.mjs');

const reset = () => {
  for (const k of Object.keys(process.env)) if (k.startsWith('AIVOXFLOW_')) delete process.env[k];
};

// ================================================================ Gemini text
reset();
process.env.AIVOXFLOW_AI_PROVIDER = 'gemini';
process.env.AIVOXFLOW_AI_MODEL = 'gemini-2.5-flash';
process.env.AIVOXFLOW_AI_API_KEY = 'test-key-not-real';
process.env.AIVOXFLOW_AI_BASE_URL = base;
process.env.AIVOXFLOW_AI_MAX_RETRIES = '1';

{
  const llm = createLLM(() => {});
  const { data, usage } = await llm.run({ task: 'probe', system: 's', user: '<input>{"ping":true}</input>' });
  ok('gemini: parses JSON response', data?.ok === true, JSON.stringify(data));
  ok('gemini: reports token usage', usage.in === 12 && usage.out === 7, JSON.stringify(usage));

  const call = seen.find((s) => s.url.includes('gemini-2.5-flash:generateContent'));
  ok('gemini: model in the URL path', Boolean(call));
  ok('gemini: key sent as x-goog-api-key header', call?.headers['x-goog-api-key'] === 'test-key-not-real');
  ok('gemini: key never appears in the URL', !seen.some((s) => s.url.includes('test-key-not-real')));
  ok('gemini: system prompt uses systemInstruction', Boolean(call?.body?.systemInstruction?.parts?.[0]?.text));
  ok('gemini: JSON mode requests application/json', call?.body?.generationConfig?.responseMimeType === 'application/json');
  ok('gemini: maxOutputTokens is sent', Number(call?.body?.generationConfig?.maxOutputTokens) > 0);

  const models = await listModels({ provider: 'gemini', apiKey: 'test-key-not-real', baseUrl: base });
  ok('gemini: listModels strips the models/ prefix', models.some((m) => m.id === 'gemini-2.5-flash'));
  ok('gemini: listModels exposes image models', models.some((m) => /image|imagen/.test(m.id)));
}

// ================================================================ Gemini failure modes
// A truncated ledger must stop the run instead of half-verifying it, and one
// malformed body must be retried inside the same budget as the HTTP call.
reset();
process.env.AIVOXFLOW_AI_PROVIDER = 'gemini';
process.env.AIVOXFLOW_AI_MODEL = 'gemini-2.5-flash';
process.env.AIVOXFLOW_AI_API_KEY = 'test-key-not-real';
process.env.AIVOXFLOW_AI_BASE_URL = base;
process.env.AIVOXFLOW_AI_MAX_RETRIES = '2';

{
  const llm = createLLM(() => {});
  let err = null;
  try {
    await llm.run({ task: 'factcheck', system: 's', user: 'MODE:truncate <input>{}</input>' });
  } catch (e) { err = e; }
  ok('gemini: truncation at maxOutputTokens is refused, never parsed',
    err !== null && /truncated the response at maxOutputTokens/.test(err.message), String(err && err.message));

  const { data } = await llm.run({ task: 'probe', system: 's', user: 'MODE:flaky <input>{}</input>' });
  ok('gemini: a malformed body is retried within the budget',
    data?.flaky === 'recovered', JSON.stringify(data));
}

// ================================================================ Ollama
reset();
process.env.AIVOXFLOW_AI_PROVIDER = 'ollama';
process.env.AIVOXFLOW_AI_MODEL = 'qwen2.5:14b';
process.env.AIVOXFLOW_AI_BASE_URL = base;

{
  const llm = createLLM(() => {});
  const { data, usage } = await llm.run({ task: 'probe', system: 's', user: '<input>{}</input>' });
  ok('ollama: works with no API key', data?.echo === 'local', JSON.stringify(data));
  ok('ollama: reports eval counts', usage.in === 21 && usage.out === 9);

  const call = seen.find((s) => s.url === '/api/chat');
  ok('ollama: uses the native /api/chat endpoint', Boolean(call));
  ok('ollama: requests JSON format', call?.body?.format === 'json');
  ok('ollama: raises num_ctx above the truncating default', Number(call?.body?.options?.num_ctx) >= 8192,
    String(call?.body?.options?.num_ctx));
  ok('ollama: no Authorization header is invented', !call?.headers?.authorization);

  const models = await listModels({ provider: 'ollama', baseUrl: base });
  ok('ollama: listModels reads /api/tags', models[0]?.id === 'qwen2.5:14b');
}

// ================================================================ images
const imgCases = [
  ['gemini', 'gemini-2.5-flash-image', (r) => r.ext === 'png' && r.width === 32 && r.height === 32],
  ['gemini', 'imagen-4.0-generate-001', (r) => r.ext === 'png' && r.width === 32],
  ['a1111', 'sd-local', (r) => r.ext === 'png' && r.width === 32],
  ['pollinations', 'flux', (r) => r.ext === 'png' && r.width === 32],
];

for (const [provider, model, assert] of imgCases) {
  reset();
  process.env.AIVOXFLOW_IMAGE_PROVIDER = provider;
  process.env.AIVOXFLOW_IMAGE_MODEL = model;
  process.env.AIVOXFLOW_IMAGE_BASE_URL = base;
  process.env.AIVOXFLOW_IMAGE_API_KEY = 'test-key-not-real';
  const outBase = `${tmp}-${provider}-${model.replace(/[^\w]/g, '')}`;
  try {
    const img = createImageProvider(() => {});
    const r = await img.generate({ prompt: 'abstract navy artwork', outPathBase: outBase });
    ok(`${provider} (${model}): returns a usable image`, assert(r) && existsSync(r.path),
      `${r.ext} ${r.width}x${r.height}`);
    try { rmSync(r.path, { force: true }); } catch { /* ignore */ }
  } catch (e) {
    ok(`${provider} (${model}): returns a usable image`, false, e.message.slice(0, 160));
  }
}

// Imagen request shape
{
  const predictCall = seen.find((s) => s.url.includes(':predict'));
  ok('imagen: uses the :predict endpoint', Boolean(predictCall));
  ok('imagen: asks for 16:9', predictCall?.body?.parameters?.aspectRatio === '16:9');
}
// A1111 request shape
{
  const sd = seen.find((s) => s.url === '/sdapi/v1/txt2img');
  ok('a1111: sends 1600x900 with a negative prompt', sd?.body?.width === 1600 && Boolean(sd?.body?.negative_prompt));
  ok('a1111: strips text/watermark via the negative prompt', /text/.test(sd?.body?.negative_prompt || ''));
}
// Pollinations request shape
{
  const poll = seen.find((s) => s.url.startsWith('/prompt/'));
  ok('pollinations: width/height/model in the query string', /width=1600/.test(poll?.url || '') && /height=900/.test(poll?.url || '') && /model=flux/.test(poll?.url || ''));
  ok('pollinations: no key is sent', !poll?.headers?.authorization && !poll?.headers['x-goog-api-key']);
}

// ================================================================ search (tavily/brave)
const resetSearch = () => {
  reset();
  process.env.AIVOXFLOW_SEARCH_TAVILY_URL = `${base}/search`;
};

// Keyless mode: no account, no key — the documented free fallback.
resetSearch();
process.env.AIVOXFLOW_SEARCH_PROVIDER = 'tavily';
{
  const s = createSearch(() => {});
  ok('tavily keyless: provider counts as available with no key', s.hasProvider === true && s.keyless === true);
  const r = await s.search('test query', { limit: 3 });
  ok('tavily keyless: results are mapped', r.length === 1 && r[0].url === 'https://example.com/a',
    JSON.stringify(r));
  const call = seen.find((x) => x.url === '/search');
  ok('tavily keyless: sends the keyless header', call?.headers['x-tavily-access-mode'] === 'keyless');
  ok('tavily keyless: no api_key is sent', call?.body?.api_key === undefined);
  ok('tavily keyless: still requests advanced depth', call?.body?.search_depth === 'advanced');
}

// Keyed mode: the key rides in the body, no keyless header.
resetSearch();
process.env.AIVOXFLOW_SEARCH_PROVIDER = 'tavily';
process.env.AIVOXFLOW_SEARCH_API_KEY = 'tvly-test-key-not-real';
{
  const s = createSearch(() => {});
  ok('tavily keyed: keyless flag is off', s.keyless === false && s.hasProvider === true);
  await s.search('test query', { limit: 3 });
  const calls = seen.filter((x) => x.url === '/search');
  const call = calls[calls.length - 1];
  ok('tavily keyed: api_key rides in the body', call?.body?.api_key === 'tvly-test-key-not-real');
  ok('tavily keyed: no keyless header', call?.headers['x-tavily-access-mode'] === undefined);
  ok('tavily keyed: key never appears in the url', !call?.url.includes('test-key'));
}

// Brave has no keyless mode — it must refuse clearly, not call out.
resetSearch();
process.env.AIVOXFLOW_SEARCH_PROVIDER = 'brave';
{
  const s = createSearch(() => {});
  ok('brave without key: hasProvider is false', s.hasProvider === false);
  let threw = '';
  try { await s.search('q'); } catch (e) { threw = e.message; }
  ok('brave without key: refuses with a clear error', /AIVOXFLOW_SEARCH_API_KEY is required/.test(threw), threw);
}

// No provider: empty results, nothing called.
resetSearch();
{
  const s = createSearch(() => {});
  const before = seen.length;
  const r = await s.search('q');
  ok('provider none: no request is made', seen.length === before && Array.isArray(r) && r.length === 0);
}

server.close();
console.log(`\n${checks - failures}/${checks} provider checks passed${failures ? ` — ${failures} FAILED` : ''}`);
if (failures) process.exit(1);
