// LLM provider adapter.
//
// One interface, three back ends:
//   mock               deterministic, offline, produces *scaffolds only*
//   openai             OpenAI Chat Completions (JSON mode)
//   openai-compatible  any /v1/chat/completions endpoint (Groq, Together, Ollama, vLLM…)
//   anthropic          Messages API
//
// Everything the pipeline needs is here: retries with bounded exponential
// backoff + jitter, a hard budget ceiling, and cost accounting per job.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(here, '..', '..');
const stateDir = path.join(repo, 'content');
const ledgerFile = path.join(stateDir, 'jobs', '_ledger.json');

const env = (name, fallback = '') => (process.env[name] || fallback).trim();
const num = (name, fallback) => {
  const v = Number(env(name, ''));
  return Number.isFinite(v) && env(name, '') !== '' ? v : fallback;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- ledger
function readLedger() {
  try { return JSON.parse(readFileSync(ledgerFile, 'utf8')); } catch { return { day: '', month: '', dayUsd: 0, monthUsd: 0 }; }
}
function writeLedger(l) {
  mkdirSync(path.dirname(ledgerFile), { recursive: true });
  writeFileSync(ledgerFile, JSON.stringify(l, null, 2), 'utf8');
}
function accountSpend(usd) {
  if (!usd) return;
  const today = new Date().toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  const l = readLedger();
  if (l.day !== today) { l.day = today; l.dayUsd = 0; }
  if (l.month !== month) { l.month = month; l.monthUsd = 0; }
  l.dayUsd = Number((l.dayUsd + usd).toFixed(6));
  l.monthUsd = Number((l.monthUsd + usd).toFixed(6));
  writeLedger(l);
}
function assertBudget(nextCost) {
  const daily = num('AIVOXFLOW_AI_BUDGET_USD_DAILY', 0);
  const monthly = num('AIVOXFLOW_AI_BUDGET_USD_MONTHLY', 0);
  const l = readLedger();
  if (daily > 0 && l.dayUsd + nextCost > daily) {
    throw new Error(`Daily budget ceiling reached (${l.dayUsd.toFixed(4)} + ${nextCost.toFixed(4)} > ${daily} USD). Raise AIVOXFLOW_AI_BUDGET_USD_DAILY or wait.`);
  }
  if (monthly > 0 && l.monthUsd + nextCost > monthly) {
    throw new Error(`Monthly budget ceiling reached (${l.monthUsd.toFixed(4)} > ${monthly} USD).`);
  }
}

// ---------------------------------------------------------------- mock
// Deterministic scaffolds. These are deliberately NOT publishable: the QA
// gates reject them (word count, missing sources). They exist so the pipeline,
// the state machine and the gates can be exercised with zero spend.
const mock = (task, input) => {
  const topic = input.topic || 'Untitled topic';
  const cat = input.category || 'ai-tools';
  if (task === 'research') {
    // Echo back the pages the pipeline actually fetched: the reading is real,
    // only the synthesis is mocked, and `mock: true` still blocks publication.
    const today = new Date().toISOString().slice(0, 10);
    return {
      summary: `Research scaffold for "${topic}". ${(input.sources || []).length} page(s) were fetched by the pipeline; no synthesis was performed because the mock provider is active.`,
      sources: (input.sources || []).map((s) => ({
        title: s.title || s.url,
        url: s.url,
        type: 'primary',
        accessedOn: today,
        read: Boolean(s.read),
        stale: false,
        keyPoints: [],
      })),
      openQuestions: [
        'Which primary sources document the current behaviour?',
        'What changed in the last 90 days?',
        'Which claims are pricing- or limit-sensitive?',
      ],
      contradictions: [],
      cannotVerify: ['Everything: the mock provider does not read or reason about the text.'],
      mock: true,
    };
  }
  if (task === 'brief') {
    return {
      searchIntent: 'informational',
      angle: `A practical, evidence-led treatment of ${topic}.`,
      readerProblem: 'The reader needs a decision they can act on today, not a feature list.',
      outline: [
        { h2: 'What actually matters here', words: 260, purpose: 'Answer-first framing' },
        { h2: 'How the options differ in practice', words: 340, purpose: 'Comparison table' },
        { h2: 'A repeatable way to choose', words: 320, purpose: 'Checklist' },
        { h2: 'Where this breaks down', words: 240, purpose: 'Limits and failure modes' },
        { h2: 'What to do next', words: 200, purpose: 'Actionable close' },
      ],
      entities: [],
      internalLinks: [],
      mock: true,
    };
  }
  if (task === 'draft') {
    const body = [
      `# DRAFT SCAFFOLD — NOT FOR PUBLICATION`,
      ``,
      `This is the mock provider's output for "${topic}". It contains no verified facts and exists only to exercise the pipeline.`,
      ``,
      `## What actually matters here`,
      ``,
      `[TODO: answer-first paragraph of 40–60 words, written from verified sources.]`,
      ``,
      `## How the options differ in practice`,
      ``,
      `[TODO: comparison table with 3–5 rows, every cell sourced.]`,
      ``,
      `## A repeatable way to choose`,
      ``,
      `[TODO: numbered checklist a reader can run in one sitting.]`,
      ``,
      `## Where this breaks down`,
      ``,
      `[TODO: honest limits, including when not to use the approach.]`,
      ``,
      `## What to do next`,
      ``,
      `[TODO: one concrete next step.]`,
    ].join('\n');
    return { title: `${topic} — scaffold`, description: 'Mock scaffold. Replace with real research.', body, mock: true };
  }
  if (task === 'factcheck') {
    return {
      claims: [],
      verdict: 'pass',
      notes: ['MOCK: no claims were extracted, so nothing was verified. The QA gates reject this draft.'],
      mock: true,
    };
  }
  if (task === 'seo') {
    return {
      seoTitle: `${topic} — AIVOXFLOW`.slice(0, 60),
      metaDescription: 'Mock meta description produced by the offline provider. Not for publication.'.slice(0, 155),
      slug: topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60),
      primaryKeyword: topic.toLowerCase(),
      secondaryKeywords: [],
      faq: [],
      takeaways: [],
      llmsSummary: 'Mock summary.',
      mock: true,
    };
  }
  if (task === 'image') {
    return {
      hero: {
        prompt: `Editorial illustration about ${topic}, deep navy background, electric blue geometric flow, no text, no logos, 16:9`,
        alt: `Abstract editorial artwork representing ${topic}`,
      },
      figures: [],
      mock: true,
    };
  }
  throw new Error(`Mock provider has no response for task "${task}"`);
};

// ---------------------------------------------------------------- http
async function postJson(url, headers, body, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}: ${text.slice(0, 400)}`);
      err.status = res.status;
      const ra = Number(res.headers.get('retry-after'));
      if (Number.isFinite(ra) && ra > 0) err.retryAfterMs = ra * 1000;
      throw err;
    }
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

const RETRYABLE = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

// ---------------------------------------------------------------- provider
export function createLLM(log = () => {}) {
  const provider = env('AIVOXFLOW_AI_PROVIDER', 'mock').toLowerCase();
  const isGemini = provider === 'gemini' || provider === 'google';
  const isOpenRouter = provider === 'openrouter';
  const isOllama = provider === 'ollama' || provider === 'local';
  const model = env('AIVOXFLOW_AI_MODEL', provider === 'mock' ? 'mock-1' : '');
  const apiKey = env('AIVOXFLOW_AI_API_KEY');
  const baseUrl = env('AIVOXFLOW_AI_BASE_URL',
    isGemini ? 'https://generativelanguage.googleapis.com'
      : provider === 'anthropic' ? 'https://api.anthropic.com'
        : isOpenRouter ? 'https://openrouter.ai/api/v1'
          : isOllama ? 'http://127.0.0.1:11434'
            : 'https://api.openai.com');
  const timeout = num('AIVOXFLOW_AI_TIMEOUT_SECONDS', isOllama ? 600 : provider === 'mock' ? 60 : 120) * 1000;
  const maxRetries = num('AIVOXFLOW_AI_MAX_RETRIES', 4);
  const maxOut = num('AIVOXFLOW_AI_MAX_OUTPUT_TOKENS', 8192);
  // Ollama silently truncates at its default context (often 2048–4096 tokens),
  // which would cut a 2 000-word draft in half. Ask for room explicitly.
  const numCtx = num('AIVOXFLOW_AI_NUM_CTX', 16384);
  const priceIn = num('AIVOXFLOW_AI_PRICE_INPUT_PER_1K', 0);
  const priceOut = num('AIVOXFLOW_AI_PRICE_OUTPUT_PER_1K', 0);

  // Ollama is local: there is no key to require, and nothing leaves the machine.
  if (provider !== 'mock' && !isOllama && !apiKey) {
    throw new Error(`AIVOXFLOW_AI_API_KEY is required for provider "${provider}". Set it, or run with AIVOXFLOW_AI_PROVIDER=mock.`);
  }
  if (provider !== 'mock' && !model) {
    throw new Error(`AIVOXFLOW_AI_MODEL is required for provider "${provider}". Run "node agents/doctor.mjs" to list the models your key can use.`);
  }

  const callOnce = async ({ system, user, json }) => {
    if (isOllama) {
      // Native Ollama API: `format: "json"` is enforced by the runtime, which is
      // more reliable than asking a small model to "return only JSON".
      const data = await postJson(`${baseUrl}/api/chat`, {}, {
        model,
        stream: false,
        ...(json ? { format: 'json' } : {}),
        options: { temperature: json ? 0.2 : 0.6, num_ctx: numCtx, num_predict: maxOut },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }, timeout);
      const text = data.message?.content || '';
      return {
        text,
        usage: { in: data.prompt_eval_count || 0, out: data.eval_count || 0 },
      };
    }

    if (isGemini) {
      // Google AI Studio / Gemini API. The key travels in a header, never in the
      // URL, so it cannot leak into logs or error messages.
      const data = await postJson(
        `${baseUrl}/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        { 'x-goog-api-key': apiKey },
        {
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
          generationConfig: {
            temperature: json ? 0.2 : 0.6,
            maxOutputTokens: maxOut,
            ...(json ? { responseMimeType: 'application/json' } : {}),
          },
        },
        timeout,
      );
      const parts = data.candidates?.[0]?.content?.parts || [];
      const text = parts.filter((p) => typeof p.text === 'string').map((p) => p.text).join('');
      if (!text) {
        const reason = data.candidates?.[0]?.finishReason || data.promptFeedback?.blockReason || 'no text returned';
        throw new Error(`Gemini returned no text (${reason}).`);
      }
      return {
        text,
        usage: {
          in: data.usageMetadata?.promptTokenCount || 0,
          out: data.usageMetadata?.candidatesTokenCount || 0,
        },
      };
    }

    if (provider === 'anthropic') {
      const data = await postJson(`${baseUrl}/v1/messages`, {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      }, {
        model,
        max_tokens: maxOut,
        system,
        messages: [{ role: 'user', content: json ? `${user}\n\nReturn ONLY valid JSON.` : user }],
      }, timeout);
      const text = (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
      return { text, usage: { in: data.usage?.input_tokens || 0, out: data.usage?.output_tokens || 0 } };
    }

    const data = await postJson(`${baseUrl}/v1/chat/completions`, {
      authorization: `Bearer ${apiKey}`,
      ...(isOpenRouter ? {
        'http-referer': 'https://aivoxflow.com',
        'x-title': 'AIVOXFLOW content agents',
      } : {}),
    }, {
      model,
      temperature: json ? 0.2 : 0.6,
      max_tokens: maxOut,
      ...(json ? { response_format: { type: 'json_object' } } : {}),
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }, timeout);
    const text = data.choices?.[0]?.message?.content || '';
    return { text, usage: { in: data.usage?.prompt_tokens || 0, out: data.usage?.completion_tokens || 0 } };
  };

  const withRetry = async (fn, label) => {
    let attempt = 0;
    let lastErr;
    while (attempt <= maxRetries) {
      try {
        return await fn();
      } catch (e) {
        lastErr = e;
        const retryable = e.status ? RETRYABLE.has(e.status) : e.name === 'AbortError' || /ECONN|ETIMEDOUT|fetch failed/i.test(e.message);
        if (!retryable || attempt === maxRetries) break;
        // Free tiers throttle hard: honour Retry-After before our own backoff.
        const backoff = e.retryAfterMs
          ? Math.min(60000, e.retryAfterMs)
          : Math.min(30000, 800 * 2 ** attempt) + Math.floor(Math.random() * 400);
        log(`  retry ${label} in ${backoff}ms (${e.message.slice(0, 80)})`);
        await sleep(backoff);
        attempt++;
      }
    }
    throw lastErr;
  };

  const run = async ({ task, system, user, json = true }) => {
    if (provider === 'mock') {
      return { data: mock(task, JSON.parse(user.match(/<input>([\s\S]*)<\/input>/)?.[1] || '{}')), usage: { in: 0, out: 0 }, costUsd: 0 };
    }
    assertBudget(0.02);
    const { text, usage } = await withRetry(() => callOnce({ system, user, json }), task);
    const costUsd = (usage.in / 1000) * priceIn + (usage.out / 1000) * priceOut;
    accountSpend(costUsd);
    if (!json) return { data: text, usage, costUsd };
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (!fenced) throw new Error(`Model returned non-JSON for "${task}": ${text.slice(0, 200)}`);
      parsed = JSON.parse(fenced[1]);
    }
    return { data: parsed, usage, costUsd };
  };

  return {
    provider,
    model,
    isMock: provider === 'mock',
    run,
    health() {
      if (provider === 'mock') return 'mock mode — scaffolds only, nothing publishable';
      return `${provider} / ${model || '(model unset)'} · timeout ${timeout / 1000}s · retries ${maxRetries}`;
    },
  };
}

// ---------------------------------------------------------------- model discovery
// Model ids change faster than documentation. This asks the provider what the
// key can actually use, so a stale default never blocks a run.
export async function listModels({ provider, apiKey, baseUrl }) {
  const p = String(provider || '').toLowerCase();

  if (p === 'ollama' || p === 'local') {
    const base = baseUrl || 'http://127.0.0.1:11434';
    const res = await fetch(`${base}/api/tags`);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    return (data.models || []).map((m) => ({
      id: m.name,
      methods: ['chat'],
      description: `${m.details?.parameter_size || ''} ${m.details?.family || ''}`.trim(),
      context: m.details?.context_length || null,
    }));
  }

  if (!apiKey) throw new Error('No API key provided.');

  if (p === 'gemini' || p === 'google') {
    const base = baseUrl || 'https://generativelanguage.googleapis.com';
    const res = await fetch(`${base}/v1beta/models?pageSize=200`, { headers: { 'x-goog-api-key': apiKey } });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    return (data.models || []).map((m) => ({
      id: String(m.name || '').replace(/^models\//, ''),
      methods: m.supportedGenerationMethods || [],
      description: m.description || '',
    }));
  }

  if (p === 'anthropic') {
    const base = baseUrl || 'https://api.anthropic.com';
    const res = await fetch(`${base}/v1/models`, {
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    return (data.data || []).map((m) => ({ id: m.id, methods: ['messages'], description: m.display_name || '' }));
  }

  // OpenAI-compatible (including OpenRouter)
  const base = baseUrl || (p === 'openrouter' ? 'https://openrouter.ai/api/v1' : 'https://api.openai.com');
  const res = await fetch(`${base}/v1/models`, { headers: { authorization: `Bearer ${apiKey}` } });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return (data.data || []).map((m) => ({ id: m.id, methods: ['chat'], description: m.name || '' }));
}
