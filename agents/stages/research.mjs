// Agent 01 (research) and Agent 02 (brief).
import { readPage } from '../lib/search.mjs';
import { prompt, wrap } from '../lib/prompt.mjs';
import { note } from '../lib/job.mjs';

const MAX_SOURCES = 6;
const MAX_CHARS_PER_SOURCE = 9000;

// Results are read across query intents, never first-come. The generic topic
// query always returns blogs; taking its first six hits starved the "official
// documentation" and "pricing OR limits OR changelog" queries — exactly where
// a vendor's own pricing and docs pages live, and exactly what the editorial
// gates ask the ledger to stand on.
export function interleave(groups, limit) {
  const out = [];
  const idx = groups.map(() => 0);
  while (out.length < limit) {
    let added = false;
    for (let g = 0; g < groups.length && out.length < limit; g++) {
      const row = groups[g][idx[g]];
      if (row) { out.push(row); idx[g] += 1; added = true; }
    }
    if (!added) break;
  }
  return out;
}

// ---------------------------------------------------------------- 01 research
export async function researchAgent(ctx) {
  const { job, llm, search, log } = ctx;

  // Two ways in: a search provider, or a hand-picked list of URLs (--sources).
  // The second needs no key, no account and no quota — you choose the sources,
  // the agent still has to read them before it may cite them.
  const manual = job.artifacts.sourceList || [];
  const groups = [];
  const seen = new Set();
  let found = [];

  if (manual.length) {
    found = manual.map((url) => ({ url, title: url, snippet: '' }));
    log(`  research: ${found.length} source(s) supplied via --sources (search skipped)`);
  } else {
    const queries = [
      job.topic,
      `${job.topic} official documentation`,
      `${job.topic} pricing OR limits OR changelog`,
      `${job.topic} problems OR limitations`,
    ];
    for (const q of queries) {
      const hits = (await search.search(q, { limit: 6 })).filter((h) => !seen.has(h.url));
      for (const h of hits) seen.add(h.url);
      groups.push(hits);
      if (seen.size >= MAX_SOURCES * 2) break;
    }
    found = groups.flat();
  }

  const picked = manual.length ? found.slice(0, MAX_SOURCES) : interleave(groups, MAX_SOURCES);
  log(`  research: ${found.length} result(s), reading ${picked.length} pages`);

  const sources = [];
  for (const s of picked) {
    try {
      const page = await readPage(s.url, { maxChars: MAX_CHARS_PER_SOURCE });
      sources.push({
        title: page.title || s.title,
        url: s.url,
        snippet: s.snippet,
        excerpt: page.text.slice(0, MAX_CHARS_PER_SOURCE),
        read: true,
      });
      log(`    read  ${s.url} (${page.text.length} chars)`);
    } catch (e) {
      sources.push({ title: s.title, url: s.url, snippet: s.snippet, read: false, error: e.message });
      log(`    skip  ${s.url} — ${e.message.slice(0, 80)}`);
    }
  }

  const { data, costUsd } = await llm.run({
    task: 'research',
    system: prompt('01-research.md'),
    user: wrap({
      topic: job.topic,
      category: job.category,
      intent: job.intent,
      notes: job.notes,
      today: new Date().toISOString().slice(0, 10),
      sources,
    }),
  });

  // Trust the reader, not the model: a source is "read" only if we read it.
  const readUrls = new Set(sources.filter((s) => s.read).map((s) => s.url));
  const merged = (data.sources || []).map((s) => ({ ...s, read: readUrls.has(s.url) }));

  job.artifacts.research = { ...data, sources: merged, fetched: sources };
  note(job, 'research:done', `${merged.length} sources, ${merged.filter((s) => s.read).length} read`);
  return { costUsd, sources: merged };
}

// ---------------------------------------------------------------- 02 brief
export async function briefAgent(ctx) {
  const { job, llm, log } = ctx;
  const research = job.artifacts.research || {};
  const corpus = ctx.corpus || [];

  const { data, costUsd } = await llm.run({
    task: 'brief',
    system: prompt('02-brief.md'),
    user: wrap({
      topic: job.topic,
      category: job.category,
      intent: job.intent,
      notes: job.notes,
      researchSummary: research.summary,
      sources: (research.sources || []).map((s) => ({ title: s.title, url: s.url, type: s.type, keyPoints: s.keyPoints })),
      contradictions: research.contradictions || [],
      openQuestions: research.openQuestions || [],
      existingArticles: corpus.map((c) => ({ title: c.title, slug: c.slug, tags: c.tags })),
    }),
  });

  job.artifacts.brief = data;
  note(job, 'brief:done', `${(data.outline || []).length} sections, ${(data.entities || []).length} entities`);
  log(`  brief: ${(data.outline || []).length} sections`);
  return { costUsd };
}
