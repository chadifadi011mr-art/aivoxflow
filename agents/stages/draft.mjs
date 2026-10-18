// Agent 03 (writer) and Agent 04 (fact-checker).
import { prompt, wrap } from '../lib/prompt.mjs';
import { note } from '../lib/job.mjs';

// ---------------------------------------------------------------- 03 draft
export async function draftAgent(ctx) {
  const { job, llm, log } = ctx;
  const brief = job.artifacts.brief || {};
  const research = job.artifacts.research || {};

  const { data, costUsd } = await llm.run({
    task: 'draft',
    system: prompt('03-draft.md'),
    user: wrap({
      topic: job.topic,
      category: job.category,
      angle: brief.angle,
      readerProblem: brief.readerProblem,
      originalValue: brief.originalValue,
      outline: brief.outline,
      entities: brief.entities,
      tables: brief.tables,
      internalLinks: brief.internalLinks,
      today: new Date().toISOString().slice(0, 10),
      sources: (research.sources || []).map((s) => ({
        title: s.title, url: s.url, type: s.type, keyPoints: s.keyPoints, quote: s.quote,
      })),
      contradictions: research.contradictions || [],
      cannotVerify: research.cannotVerify || [],
    }),
  });

  job.artifacts.draft = data;
  note(job, 'draft:done', `${(data.body || '').split(/\s+/).length} words`);
  log(`  draft: ${(data.body || '').split(/\s+/).filter(Boolean).length} words`);
  return { costUsd };
}

// ---------------------------------------------------------------- 04 fact-check
export async function factCheckAgent(ctx) {
  const { job, llm, log } = ctx;
  const draft = job.artifacts.draft || {};
  const research = job.artifacts.research || {};

  const { data, costUsd } = await llm.run({
    task: 'factcheck',
    system: prompt('04-factcheck.md'),
    user: wrap({
      body: draft.body,
      sources: (research.sources || []).map((s) => ({
        title: s.title, url: s.url, keyPoints: s.keyPoints, quote: s.quote, publishedOn: s.publishedOn, accessedOn: s.accessedOn,
      })),
      today: new Date().toISOString().slice(0, 10),
    }),
  });

  // Apply the checker's own corrections before the gates see the text, but keep
  // the original for the audit trail. A recheck (second fact-check pass over
  // already-corrected text) must not overwrite the first pass's original.
  const corrections = data.corrections || [];
  if (corrections.length && draft.body) {
    let body = draft.body;
    let applied = 0;
    for (const c of corrections) {
      if (c.find && body.includes(c.find)) { body = body.split(c.find).join(c.replace); applied++; }
    }
    if (applied) {
      if (job.artifacts.draftPreCorrection) {
        job.artifacts.draftPreCorrectionHistory = [
          ...(job.artifacts.draftPreCorrectionHistory || []),
          job.artifacts.draftPreCorrection,
        ];
      }
      job.artifacts.draftPreCorrection = { body: draft.body };
      draft.body = body;
      log(`  factcheck: applied ${applied}/${corrections.length} corrections`);
    }
  }

  // A recheck replaces the ledger; archive the earlier one so its verdict and
  // the human resolutions stamped onto its claims stay in the audit trail.
  if (job.artifacts.factcheck) {
    job.artifacts.factcheckHistory = [
      ...(job.artifacts.factcheckHistory || []),
      job.artifacts.factcheck,
    ];
  }
  job.artifacts.factcheck = data;
  note(job, 'factcheck:done', `${(data.claims || []).length} claims · verdict ${data.verdict}`);
  log(`  factcheck: ${(data.claims || []).length} claims · ${data.verdict}`);
  return { costUsd, verdict: data.verdict };
}
