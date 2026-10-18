#!/usr/bin/env node
// AIVOXFLOW content agents — orchestrator.
//
//   node agents/run.mjs --topic "How to choose an AI writing tool" --category ai-tools
//   node agents/run.mjs --topic "…" --category tutorials --notes "focus on pricing traps"
//   node agents/run.mjs --list
//   node agents/run.mjs --resume job_20261017123000_ab12cd
//   node agents/run.mjs --resolve job_… --decision "why the claim ledger is acceptable"
//
// Flags:
//   --publish   promote a fully-gated draft into site/data/articles/ (default: stop at "scheduled")
//   --resolve   continue a needs_human_review stop; requires --decision
//   --force     allow a second job for the same topic
//   --quiet     only print failures and the final summary
//
// Environment: see agents/README.md. With no keys the pipeline runs in mock mode,
// which produces scaffolds that the gates deliberately reject — that is the point.
import { parseArgs } from 'node:util';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { createLLM } from './lib/llm.mjs';
import { createSearch } from './lib/search.mjs';
import { createImageProvider } from './lib/render-image.mjs';
import {
  createJob, transition, saveJob, loadJob, listJobs, note, resolveReview, nowIso, TERMINAL, repo,
} from './lib/job.mjs';
import { researchAgent, briefAgent } from './stages/research.mjs';
import { draftAgent, factCheckAgent } from './stages/draft.mjs';
import { seoAgent, imageAgent } from './stages/seo.mjs';
import { qaAgent, saveScheduled, promote } from './stages/qa.mjs';

const { values: args } = parseArgs({
  options: {
    topic: { type: 'string' },
    category: { type: 'string', default: 'ai-tools' },
    intent: { type: 'string', default: '' },
    notes: { type: 'string', default: '' },
    publish: { type: 'boolean', default: false },
    force: { type: 'boolean', default: false },
    quiet: { type: 'boolean', default: false },
    list: { type: 'boolean', default: false },
    resume: { type: 'string' },
    resolve: { type: 'string' },
    decision: { type: 'string' },
    fixture: { type: 'string' },
    sources: { type: 'string' },
    slot: { type: 'string' },
  },
  allowPositionals: true,
});

const C = process.stdout.isTTY
  ? { dim: '\x1b[2m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', bold: '\x1b[1m', off: '\x1b[0m' }
  : { dim: '', red: '', green: '', yellow: '', bold: '', off: '' };
const log = (...a) => { if (!args.quiet) console.log(...a); };
const head = (s) => log(`\n${C.bold}${s}${C.off}`);

const loadJson = (p, fallback) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return fallback; } };

const corpus = () => {
  const dir = path.join(repo, 'site', 'data', 'articles');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => {
    const a = JSON.parse(readFileSync(path.join(dir, f), 'utf8'));
    return { slug: a.slug, title: a.title, description: a.description, body: a.body, tags: a.tags || [] };
  });
};

// ---------------------------------------------------------------- list
if (args.list) {
  const jobs = listJobs();
  if (!jobs.length) { console.log('No jobs yet.'); process.exit(0); }
  console.log(`${'ID'.padEnd(28)} ${'STATE'.padEnd(20)} ${'TOPIC'}`);
  for (const j of jobs) {
    console.log(`${j.id.padEnd(28)} ${j.state.padEnd(20)} ${j.topic.slice(0, 60)}`);
  }
  process.exit(0);
}

// ---------------------------------------------------------------- boot
let job;
if (args.resolve) {
  job = loadJob(args.resolve);
  if (job.state !== 'needs_human_review') {
    console.error(`Job ${job.id} is in state "${job.state}" — --resolve only applies to a job waiting in needs_human_review.`);
    process.exit(2);
  }
  if (!args.decision || args.decision.trim().length < 10) {
    console.error('Add --decision "what you checked and accepted" — the resolution is the human review record.');
    process.exit(2);
  }
  head('Human resolution');
  log(`  stop       ${job.review?.reason || '(reason not recorded — see the job log)'}`);
  const fcLedger = job.artifacts.factcheck;
  if (fcLedger?.claims?.length) {
    const counts = {};
    for (const c of fcLedger.claims) counts[c.status] = (counts[c.status] || 0) + 1;
    log(`  ledger     ${fcLedger.claims.length} claims · ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ')}`);
    for (const c of fcLedger.claims.filter((x) => x.status !== 'verified')) {
      log(`    ${C.yellow}${c.status}${C.off} ${c.text}`);
      log(`      ${C.dim}${c.note || ''}${C.off}`);
    }
  }
  try {
    const r = resolveReview(job, args.decision);
    saveJob(job);
    log(`  resolved   → ${r.from} · ${r.resolved} claim(s) stamped with the decision`);
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }
} else if (args.resume) {
  job = loadJob(args.resume);
  if (TERMINAL.includes(job.state)) {
    const hint = job.state === 'needs_human_review'
      ? ` Review the stop, then run: node agents/run.mjs --resolve ${job.id} --decision "…"`
      : '';
    console.error(`Job ${job.id} is in terminal state "${job.state}" — start a new job instead.${hint}`);
    process.exit(2);
  }
  log(`${C.dim}Resuming ${job.id} from "${job.state}"${C.off}`);
} else {
  if (!args.topic) {
    console.error('Usage: node agents/run.mjs --topic "…" [--category ai-tools] [--publish]');
    console.error('       node agents/run.mjs --resolve job_… --decision "…"');
    console.error('       node agents/run.mjs --list');
    process.exit(2);
  }
  job = createJob({
    topic: args.topic,
    category: args.category,
    intent: args.intent,
    notes: args.notes,
    force: args.force,
  });
}

const llm = createLLM(log);
const search = createSearch(log);
const image = createImageProvider(log);

// --slot <iso> — the publication slot from the calendar. The article is written
// now but dated for the slot, and the site's build hides it until that date.
if (args.slot) {
  if (Number.isNaN(Date.parse(args.slot))) {
    console.error(`Invalid --slot "${args.slot}" (expected ISO 8601, e.g. 2026-10-20T08:00:00Z).`);
    process.exit(2);
  }
  job.scheduledFor = args.slot;
  note(job, 'slot:set', args.slot);
  log(`  slot       ${args.slot} (published date ${args.slot.slice(0, 10)})`);
}

// --fixture <file> injects a research pack and skips the search stage. It is a
// development aid for exercising the rest of the pipeline offline; the sourcing
// gate still refuses to publish mock research.
if (args.fixture && job.state === 'idea') {
  const fx = JSON.parse(readFileSync(args.fixture, 'utf8'));
  job.artifacts.research = fx.research || fx;
  job.state = 'research';
  note(job, 'fixture:loaded', args.fixture);
  log(`  ${C.yellow}fixture${C.off}    ${args.fixture} (search stage skipped)`);
}

// --sources <file> — one URL per line. The agent reads each page and must cite
// what it read; no search provider, no key, no quota.
if (args.sources && job.state === 'idea') {
  const raw = readFileSync(args.sources, 'utf8');
  const urls = raw.split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && /^https?:\/\//.test(l));
  if (!urls.length) {
    console.error(`${C.red}No usable URLs in ${args.sources} (one https:// URL per line).${C.off}`);
    process.exit(2);
  }
  job.artifacts.sourceList = urls;
  note(job, 'sources:listed', `${urls.length} urls from ${args.sources}`);
  log(`  ${C.yellow}sources${C.off}    ${urls.length} URL(s) from ${args.sources}`);
}

job.provider = { name: llm.provider, model: llm.model, search: search.provider, image: image.provider };

head(`AIVOXFLOW content agents · ${job.id}`);
log(`  topic      ${job.topic}`);
log(`  category   ${job.category}`);
log(`  llm        ${llm.health()}`);
log(`  search     ${search.provider}${search.keyless ? ' (keyless — free, rate-limited)' : ''}${
  search.hasProvider ? ''
    : job.artifacts.sourceList ? ` (${job.artifacts.sourceList.length} URLs supplied)`
      : ' (no provider — research will stop for review)'}`);
log(`  images     ${image.provider}`);

const ctx = {
  job, llm, search, image, log,
  corpus: corpus(),
  categories: loadJson(path.join(repo, 'site', 'data', 'categories.json'), { categories: [] }).categories,
};

const addCost = (r) => {
  if (!r) return;
  job.usage.costUsd = Number((job.usage.costUsd + (r.costUsd || 0)).toFixed(6));
};

async function fail(err, from) {
  note(job, 'error', err.message);
  try { transition(job, 'failed', err.message); } catch { job.state = 'failed'; }
  saveJob(job);
  console.error(`\n${C.red}FAILED${C.off} at ${from}: ${err.message}`);
  process.exit(1);
}

function stopForReview(reason) {
  // Record the exact stage the pipeline stopped at: resolveReview() may only
  // ever return the job here, and only with a written human decision.
  job.review = { from: job.state, reason, at: nowIso() };
  transition(job, 'needs_human_review', reason);
  saveJob(job);
  console.log(`\n${C.yellow}NEEDS HUMAN REVIEW${C.off} — ${reason}`);
  console.log(`${C.dim}Job: ${job.id}  ·  log: content/jobs/${job.id}.json${C.off}`);
  console.log(`${C.dim}Inspect the stop, then continue with:${C.off}`);
  console.log(`${C.dim}  node agents/run.mjs --resolve ${job.id} --decision "what you checked"${C.off}`);
  process.exit(3);
}

// ---------------------------------------------------------------- pipeline
try {
  // 01 research
  if (job.state === 'idea') {
    transition(job, 'research');
    head('01 · Research');
    addCost(await researchAgent(ctx));
    saveJob(job);

    const read = (job.artifacts.research.sources || []).filter((s) => s.read).length;
    if (!search.hasProvider && !job.artifacts.sourceList) {
      stopForReview('No search provider configured (AIVOXFLOW_SEARCH_PROVIDER) and no --sources list. Nothing was researched, so nothing may be written.');
    }
    if (read < 4) {
      stopForReview(`Only ${read} source(s) could be read; the minimum is 4. Add sources or narrow the topic.`);
    }
  }

  // 02 brief
  if (job.state === 'research') {
    transition(job, 'brief');
    head('02 · Brief & angle');
    addCost(await briefAgent(ctx));
    saveJob(job);
  }

  // 03 draft
  if (job.state === 'brief') {
    transition(job, 'draft');
    head('03 · Draft');
    addCost(await draftAgent(ctx));
    saveJob(job);
  }

  // 04 fact-check
  if (job.state === 'draft') {
    transition(job, 'fact_check');
    head('04 · Fact-check');
    const fc = await factCheckAgent(ctx);
    addCost(fc);
    saveJob(job);
    if (fc.verdict && fc.verdict !== 'pass') {
      stopForReview(`Fact-check verdict: ${fc.verdict}. Resolve the claim ledger before continuing.`);
    }
  }

  // 05 seo
  if (job.state === 'fact_check') {
    transition(job, 'seo_qa');
    head('05 · Search & AI discovery');
    addCost(await seoAgent(ctx));
    saveJob(job);
  }

  // 06 images
  if (job.state === 'seo_qa') {
    transition(job, 'image');
    head('06 · Art direction');
    addCost(await imageAgent(ctx));
    saveJob(job);
  }

  // 07 editorial QA
  if (job.state === 'image') {
    transition(job, 'editorial_qa');
    head('07 · Editorial QA');
    const qa = await qaAgent(ctx);
    saveJob(job);
    if (!qa.pass) {
      stopForReview(`${qa.result.blockers} blocking gate(s). See the gate report above.`);
    }
  }

  // 08 schedule
  if (job.state === 'editorial_qa') {
    transition(job, 'scheduled', 'all gates passed');
    const file = saveScheduled(job);
    saveJob(job);
    head('08 · Scheduled');
    log(`  draft  ${path.relative(repo, file)}`);
  }

  // 09 publish (explicit)
  if (args.publish && job.state === 'scheduled') {
    const file = promote(job);
    transition(job, 'published');
    saveJob(job);
    head('09 · Published');
    log(`  article ${path.relative(repo, file)}`);
    log(`  ${C.dim}Run "npm run build && npm test" to verify the site.${C.off}`);
  }

  head('Summary');
  log(`  state      ${job.state}`);
  log(`  cost       $${job.usage.costUsd.toFixed(4)}`);
  log(`  job file   content/jobs/${job.id}.json`);
  if (job.state === 'scheduled' && !args.publish) {
    log(`  ${C.dim}Nothing was published. Review content/drafts/, then re-run with --publish.${C.off}`);
  }
} catch (e) {
  await fail(e, job.state);
}
