// Job record, state machine and persistence.
//
// States follow AGENTS.md exactly:
//   idea → research → brief → draft → fact_check → seo_qa → image
//        → editorial_qa → scheduled → published
// Terminal/recovery: rejected · needs_human_review · failed
//
// Editorial QA runs last on purpose: it must judge the finished artefact,
// including the rendered artwork and the final SEO fields, not an intermediate.
//
// Every job carries an idempotency key so the same brief can never produce two
// articles, plus timestamps, provider metadata, token/cost accounting and a
// human-readable log.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const repo = path.join(here, '..', '..');
export const contentDir = path.join(repo, 'content');
export const jobsDir = path.join(contentDir, 'jobs');
export const draftsDir = path.join(contentDir, 'drafts');

export const STATES = [
  'idea', 'research', 'brief', 'draft', 'fact_check', 'editorial_qa',
  'seo_qa', 'image', 'scheduled', 'published',
];
export const TERMINAL = ['rejected', 'needs_human_review', 'failed'];

const NEXT = {
  idea: ['research', 'rejected', 'failed'],
  research: ['brief', 'needs_human_review', 'failed'],
  brief: ['draft', 'rejected', 'needs_human_review', 'failed'],
  draft: ['fact_check', 'rejected', 'failed'],
  fact_check: ['seo_qa', 'needs_human_review', 'failed'],
  seo_qa: ['image', 'needs_human_review', 'failed'],
  image: ['editorial_qa', 'needs_human_review', 'failed'],
  editorial_qa: ['scheduled', 'rejected', 'needs_human_review', 'failed'],
  scheduled: ['published', 'rejected', 'failed'],
  published: ['needs_human_review'],
  rejected: [], needs_human_review: [], failed: [],
};

export const nowIso = () => new Date().toISOString();

export const idempotencyKey = (parts) =>
  createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 24);

export function createJob({ topic, category, intent = '', notes = '', force = false }) {
  const key = idempotencyKey({ topic: topic.toLowerCase().trim(), category });
  if (!force) {
    for (const f of existsSync(jobsDir) ? readdirSync(jobsDir) : []) {
      if (!f.endsWith('.json') || f.startsWith('_')) continue;
      try {
        const j = JSON.parse(readFileSync(path.join(jobsDir, f), 'utf8'));
        if (j.idempotencyKey === key && !TERMINAL.includes(j.state)) {
          throw new Error(`A job for this topic already exists (${j.id}) in state "${j.state}". Use --force to create another.`);
        }
      } catch (e) {
        if (/already exists/.test(e.message)) throw e;
      }
    }
  }
  const id = `job_${nowIso().replace(/[-:T]/g, '').slice(0, 14)}_${randomUUID().slice(0, 6)}`;
  return {
    id,
    idempotencyKey: key,
    state: 'idea',
    topic,
    category,
    intent,
    notes,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    provider: null,
    usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
    attempts: {},
    artifacts: {},
    gates: {},
    log: [{ at: nowIso(), event: 'created', note: topic }],
  };
}

export function transition(job, to, note = '') {
  const allowed = NEXT[job.state] || [];
  if (!allowed.includes(to)) {
    throw new Error(`Illegal transition ${job.state} → ${to} (allowed: ${allowed.join(', ') || 'none'})`);
  }
  job.log.push({ at: nowIso(), event: `${job.state} → ${to}`, note });
  job.state = to;
  job.updatedAt = nowIso();
  return job;
}

export function note(job, event, detail = '') {
  job.log.push({ at: nowIso(), event, note: detail });
  job.updatedAt = nowIso();
}

export function saveJob(job) {
  mkdirSync(jobsDir, { recursive: true });
  writeFileSync(path.join(jobsDir, `${job.id}.json`), JSON.stringify(job, null, 2), 'utf8');
}

export function loadJob(id) {
  const f = path.join(jobsDir, `${id}.json`);
  if (!existsSync(f)) throw new Error(`Job not found: ${id}`);
  return JSON.parse(readFileSync(f, 'utf8'));
}

export function listJobs() {
  if (!existsSync(jobsDir)) return [];
  return readdirSync(jobsDir)
    .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
    .map((f) => JSON.parse(readFileSync(path.join(jobsDir, f), 'utf8')))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function saveDraft(slug, draft) {
  mkdirSync(draftsDir, { recursive: true });
  const f = path.join(draftsDir, `${slug}.json`);
  writeFileSync(f, JSON.stringify(draft, null, 2), 'utf8');
  return f;
}
