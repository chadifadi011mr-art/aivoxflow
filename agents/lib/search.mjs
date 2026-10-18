// Research adapters: web search + page reading.
//
// Providers (AIVOXFLOW_SEARCH_PROVIDER):
//   none    → no search; the research stage marks the job needs_human_review
//   tavily  → https://api.tavily.com/search — with an API key, or keyless when
//             AIVOXFLOW_SEARCH_API_KEY is empty: no account, no key, same
//             responses; free and rate-limited (docs.tavily.com/documentation/
//             keyless). A free key = 1,000 credits/month, no card required.
//   brave   → https://api.search.brave.com/res/v1/web/search (key required)
//
// Reading a page is provider-independent: fetch, strip chrome, return text.
// The research agent must quote from what it actually read — snippets are not
// evidence.

const env = (name, fallback = '') => (process.env[name] || fallback).trim();

const UA = 'AIVOXFLOW-Research/1.0 (+https://aivoxflow.com/about/)';

async function timedFetch(url, opts = {}, ms = 15000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal, redirect: 'follow' });
  } finally {
    clearTimeout(timer);
  }
}

export function createSearch(log = () => {}) {
  const provider = env('AIVOXFLOW_SEARCH_PROVIDER', 'none').toLowerCase();
  const key = env('AIVOXFLOW_SEARCH_API_KEY');
  // Tests point this at a local stub; production keeps the real endpoint.
  const tavilyUrl = env('AIVOXFLOW_SEARCH_TAVILY_URL', 'https://api.tavily.com/search');
  const keyless = provider === 'tavily' && !key;

  const search = async (query, { limit = 8 } = {}) => {
    if (provider === 'none') {
      log('  search: no provider configured (AIVOXFLOW_SEARCH_PROVIDER=none)');
      return [];
    }

    if (provider === 'tavily') {
      const headers = { 'content-type': 'application/json' };
      const payload = {
        query,
        max_results: limit,
        search_depth: 'advanced',
        include_answer: false,
        include_raw_content: false,
      };
      if (key) payload.api_key = key;
      else headers['x-tavily-access-mode'] = 'keyless';
      const res = await timedFetch(tavilyUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`tavily ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const data = await res.json();
      return (data.results || []).map((r) => ({
        title: r.title, url: r.url, snippet: r.content || '', score: r.score ?? null,
      }));
    }

    if (provider === 'brave') {
      if (!key) throw new Error(`AIVOXFLOW_SEARCH_API_KEY is required for "${provider}".`);
      const res = await timedFetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${limit}`, {
        headers: { 'x-subscription-token': key, accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`brave ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const data = await res.json();
      return (data.web?.results || []).map((r) => ({
        title: r.title, url: r.url, snippet: r.description || '', score: null,
      }));
    }

    throw new Error(`Unknown AIVOXFLOW_SEARCH_PROVIDER "${provider}"`);
  };

  return { provider, keyless, hasProvider: provider !== 'none' && (provider === 'tavily' || Boolean(key)), search };
}

// ---------------------------------------------------------------- page text
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”' };

export function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<\/(p|div|section|article|li|h[1-6]|tr|blockquote)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (m, d) => String.fromCharCode(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function readPage(url, { maxChars = 14000 } = {}) {
  const res = await timedFetch(url, { headers: { 'user-agent': UA, accept: 'text/html,*/*' } }, 20000);
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  const type = res.headers.get('content-type') || '';
  if (!/text\/html|text\/plain|application\/(xhtml|xml)/i.test(type)) {
    throw new Error(`GET ${url} → unsupported content-type ${type}`);
  }
  const html = await res.text();
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').trim();
  const text = htmlToText(html);
  return { url, title, text: text.slice(0, maxChars), truncated: text.length > maxChars };
}

// A cheap liveness check used by the sourcing gate.
export async function headOk(url) {
  try {
    const res = await timedFetch(url, { method: 'GET', headers: { 'user-agent': UA, range: 'bytes=0-2048' } }, 12000);
    return res.status >= 200 && res.status < 400;
  } catch {
    return false;
  }
}
