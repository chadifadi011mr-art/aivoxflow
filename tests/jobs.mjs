// Job state machine and human-resolution contract tests — no network, no keys.
//
// needs_human_review is a dead end for automation on purpose: transition()
// cannot leave it, --resume refuses it, and only resolveReview() with a
// written human decision returns the job to the stage that stopped. The
// sourcing gate must block on unresolved claims and accept (only) claims
// stamped with that decision.
//
// Usage: node tests/jobs.mjs
import { createJob, transition, resolveReview, TERMINAL } from '../agents/lib/job.mjs';
import { runGates, densityOf } from '../agents/lib/gates.mjs';
import { factCheckAgent } from '../agents/stages/draft.mjs';
import { seoAgent } from '../agents/stages/seo.mjs';
import { interleave } from '../agents/stages/research.mjs';

let failures = 0;
let checks = 0;
const ok = (name, cond, detail = '') => {
  checks++;
  if (cond) console.log(`PASS  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
};
const throws = (fn) => { try { fn(); return false; } catch { return true; } };

// ------------------------------------------------- pipeline up to the stop
const job = createJob({ topic: 'State machine probe', category: 'ai-tools', force: true });
transition(job, 'research');
transition(job, 'brief');
transition(job, 'draft');
transition(job, 'fact_check');
ok('fact_check is reachable through legal transitions', job.state === 'fact_check');

job.artifacts.factcheck = {
  claims: [
    { text: 'A claim a source states directly.', status: 'verified', sourceUrl: 'https://example.com/a' },
    { text: 'A claim no source states.', status: 'unverified', note: 'not in the pack' },
  ],
  verdict: 'needs_human_review',
  corrections: [],
};
job.review = { from: job.state, reason: 'Fact-check verdict: needs_human_review.', at: new Date().toISOString() };
transition(job, 'needs_human_review');
ok('fact_check → needs_human_review is legal', job.state === 'needs_human_review');
ok('needs_human_review is terminal for automation', TERMINAL.includes('needs_human_review'));
ok('transition() cannot leave the review state', throws(() => transition(job, 'seo_qa')));
ok('transition() cannot jump straight to scheduled', throws(() => transition(job, 'scheduled')));

// ------------------------------------------------- resolve guards
ok('resolveReview refuses other states', throws(() => resolveReview({ state: 'draft', review: { from: 'draft' } }, 'a real decision here')));
ok('resolveReview refuses a missing stop record', throws(() => resolveReview({ state: 'needs_human_review' }, 'a real decision here')));
ok('resolveReview refuses a token decision', throws(() => resolveReview(job, 'ok')));
ok('a refused resolve leaves the job waiting', job.state === 'needs_human_review');

// ------------------------------------------------- resolve happy path
const decision = 'Accepted the applied corrections: the invented GPT-6 pricing line was cut and the unverified base price removed.';
const r = resolveReview(job, decision);
ok('resolution returns to the exact stopping stage', r.from === 'fact_check' && job.state === 'fact_check');
ok('the unverified claim is stamped with the decision',
  job.artifacts.factcheck.claims[1].resolved === true && job.artifacts.factcheck.claims[1].resolution === decision);
ok('verified claims stay untouched', job.artifacts.factcheck.claims[0].resolved === undefined);
ok('the resolution lands in the audit log',
  job.log.some((e) => e.event === 'needs_human_review → fact_check' && e.note === `human resolution: ${decision}`));
ok('the original verdict is preserved as history', job.artifacts.factcheck.verdict === 'needs_human_review');
ok('the pipeline continues from fact_check', transition(job, 'seo_qa') && job.state === 'seo_qa');

// ------------------------------------------------- sourcing gate x ledger
const research = { sources: [1, 2, 3, 4].map((i) => ({ url: `https://example.com/${i}`, read: true })) };
const draft = { body: 'A body sentence that contains no figures.', title: 'A title', description: 'A description.', slug: 'a-slug' };
const sourcing = (claims, body = draft.body) => runGates({ draft: { ...draft, body }, research, factcheck: { claims }, seo: {}, corpus: [] })
  .gates.find((g) => g.name === 'sourcing');

const blocked = sourcing([{ text: 'dubious', status: 'unverified' }]);
ok('sourcing blocks an unresolved claim', blocked.pass === false && /neither verified, framed as opinion, nor human-resolved/.test(blocked.findings.join(' ')),
  JSON.stringify(blocked.findings));

const cleared = sourcing([{ text: 'dubious', status: 'unverified', resolved: true, resolution: decision }]);
ok('sourcing accepts a human-resolved claim', cleared.pass === true, JSON.stringify(cleared.findings));

const opinion = sourcing([{ text: 'Buy the cheaper tool when features tie', status: 'opinion' }]);
ok('sourcing accepts a claim framed as opinion', opinion.pass === true, JSON.stringify(opinion.findings));

const empty = sourcing([]);
ok('sourcing still blocks an empty ledger', empty.pass === false && /No claim ledger/.test(empty.findings.join(' ')));

// figure-bearing units: every number outside a citation must be in the ledger
const covered = sourcing(
  [{ text: 'ChatGPT Plus costs 20 dollars per month', status: 'verified' }],
  'It costs 20 dollars per month.\n\nRenews at 20 dollars monthly.',
);
ok('sourcing accepts units whose figures sit in the ledger', covered.pass === true, JSON.stringify(covered.findings));

const uncovered = sourcing(
  [{ text: 'an unrelated verified sentence', status: 'verified' }],
  'It costs 60 dollars per month.\n\nRenews at 365 days after signup.\n\nAlerts fire at 85 percent.',
);
ok('sourcing blocks units whose figures are missing', uncovered.pass === false && /missing from the claim ledger/.test(uncovered.findings.join(' ')),
  JSON.stringify(uncovered.findings));

const citation = sourcing(
  [{ text: 'an unrelated verified sentence', status: 'verified' }],
  'Nothing numeric here.\n\n- Vendor: [Pricing Study 2026](https://example.com/2026-study)\n- Meta: [Guide 2025](https://example.com/2025)\n- Note: [Index 2024](https://example.com/2024)',
);
ok('digits that live only inside citations are not this article\'s claims', citation.pass === true, JSON.stringify(citation.findings));

// ------------------------------------------------- structure gate x markdown
const structureOf = (body) => runGates({ draft: { ...draft, body }, research, factcheck: { claims: [{ text: 'x', status: 'verified' }] }, seo: {}, corpus: [] })
  .gates.find((g) => g.name === 'structure');
const longWords = Array(120).fill('carefully').join(' ');
ok('a 120-word list item is structure, not a paragraph',
  !structureOf(`## One\n\n- ${longWords}`).findings.some((f) => /exceed 110/.test(f)));
const longProse = (n) => Array.from({ length: n }, () => longWords).join('\n\n');
ok('three 120-word prose paragraphs still block',
  structureOf(`## One\n\n${longProse(3)}`).findings.some((f) => /exceed 110/.test(f)));

// ------------------------------------------------- recheck: resolve into a fact-check re-run
const job2 = {
  state: 'needs_human_review',
  review: { from: 'editorial_qa', reason: '2 blocking gate(s).' },
  log: [],
  artifacts: { factcheck: { claims: [{ text: 'old', status: 'unverified' }], verdict: 'needs_human_review' } },
};
const rr = resolveReview(job2, decision, { recheck: true });
ok('recheck returns the job to draft for a fact-check re-run',
  rr.rechecked === true && rr.from === 'draft' && job2.state === 'draft');
ok('the recheck is visible in the audit log',
  job2.log.at(-1).event === 'needs_human_review → draft' && /recheck requested/.test(job2.log.at(-1).note) && job2.review.recheck === true);
const job3 = { state: 'needs_human_review', review: { from: 'editorial_qa' }, log: [], artifacts: {} };
ok('recheck without a ledger is refused', throws(() => resolveReview(job3, decision, { recheck: true })));

// ------------------------------------------------- research reads every query intent
{
  const groups = [['a1', 'a2', 'a3'], ['b1'], ['c1', 'c2']];
  ok('interleave reads across query intents, not first-come',
    JSON.stringify(interleave(groups, 5)) === JSON.stringify(['a1', 'b1', 'c1', 'a2', 'c2']),
    JSON.stringify(interleave(groups, 5)));
  ok('interleave respects the read limit', interleave(groups, 2).length === 2);
  ok('interleave stops when every group is exhausted', interleave(groups, 99).length === 6);
}

// ------------------------------------------------- keyword density is phrase maths
{
  const body = 'Widgets pricing starts free. Widgets pricing scales with seats. Plenty of other words here. '
    + 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt. '.repeat(25);
  const d = densityOf(body, 'widgets pricing');
  ok('density counts phrase occurrences for a multi-word keyword', d > 0 && d < 2.5, String(d));
  ok('density is zero when the phrase is absent', densityOf(body, 'nonexistent phrase here') === 0);
  ok('density flags a stuffed phrase', densityOf('widgets pricing '.repeat(30) + 'tail words', 'widgets pricing') > 2.5);

  const kwLinks = '\n\n[one](/articles/a/) [two](/articles/b/) [three](/articles/c/)';
  const mkSeoDraft = (body) => ({
    title: 'Widgets Pricing: Compare Costs Before You Commit',
    description: 'D'.repeat(150),
    slug: 'widgets-pricing',
    body,
    answerFirst: 'An answer that clears the ai-first word window without any help from the seo gate which ignores it. '.repeat(2),
    takeaways: ['one'],
  });
  const seoGate = (body) => runGates({
    draft: mkSeoDraft(body),
    research,
    factcheck: { claims: [{ text: 'x', status: 'verified' }] },
    seo: { primaryKeyword: 'widgets pricing' },
    corpus: [],
  }).gates.find((g) => g.name === 'seo');
  const healthy = seoGate('Widgets pricing: how to compare widgets without burning the budget.'
    + ' lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor. '.repeat(12) + kwLinks);
  ok('seo gate: a natural keyword passes with no density advisory',
    healthy.pass === true && !healthy.findings.some((f) => /very low|stuffing/.test(f)), JSON.stringify(healthy.findings));
  const stuffed = seoGate('widgets pricing widgets pricing widgets pricing widgets pricing widgets pricing widgets pricing. '
    + 'lorem ipsum dolor sit amet consectetur adipiscing elit. '.repeat(6) + kwLinks);
  ok('seo gate: a stuffed keyword still blocks',
    stuffed.pass === false && stuffed.findings.some((f) => /stuffing/.test(f)), JSON.stringify(stuffed.findings));
}

// ------------------------------------------------- seo agent keyword self-check
{
  const calls = [];
  const mk = (datas) => ({ run: async (a) => { calls.push(a); return { data: datas[Math.min(calls.length - 1, datas.length - 1)], costUsd: 0 }; } });
  const freshJob = () => ({
    id: 'seo-test', topic: 'Widgets', category: 'ai-tools', log: [],
    artifacts: {
      draft: {
        title: 'Widgets Pricing Guide for Teams',
        description: 'x', answerFirst: 'y',
        body: 'Widgets pricing starts free for everyone. '.repeat(6)
          + '\n\n## A section\n\n[one](/articles/a) [two](/articles/b) [three](/articles/c)',
      },
    },
  });
  const good = {
    seoTitle: 'Widgets Pricing: How to Compare Costs', primaryKeyword: 'widgets pricing',
    metaDescription: 'm'.repeat(150), slug: 'widgets-pricing', faq: [], llmsSummary: 's', internalLinks: [],
  };
  const bad = { ...good, primaryKeyword: 'widgets pricing comparison tools' };

  const j1 = freshJob();
  await seoAgent({ job: j1, llm: mk([bad, good]), log: () => {} });
  ok('seo: a mismatched keyword triggers exactly one corrective round', calls.length === 2, String(calls.length));
  ok('seo: the corrective answer applies when it fits',
    j1.artifacts.seo.primaryKeyword === 'widgets pricing', JSON.stringify(j1.artifacts.seo.primaryKeyword));
  ok('seo: keywordPlacement is measured, not claimed',
    j1.artifacts.seo.keywordPlacement.inTitle === true
    && j1.artifacts.seo.keywordPlacement.inFirst100Words === true
    && j1.artifacts.seo.keywordPlacement.densityPercent > 0, JSON.stringify(j1.artifacts.seo.keywordPlacement));

  calls.length = 0;
  const j2 = freshJob();
  await seoAgent({ job: j2, llm: mk([good]), log: () => {} });
  ok('seo: a fitting keyword needs no extra call', calls.length === 1, String(calls.length));

  calls.length = 0;
  const j3 = freshJob();
  const stillBad = { ...good, primaryKeyword: 'widgets pricing costs 2026 money' };
  await seoAgent({ job: j3, llm: mk([bad, stillBad]), log: () => {} });
  ok('seo: two mismatched rounds keep the first answer for the gate to judge',
    calls.length === 2 && j3.artifacts.seo.primaryKeyword === bad.primaryKeyword,
    JSON.stringify({ calls: calls.length, kw: j3.artifacts.seo.primaryKeyword }));
}

// ------------------------------------------------- fact-check recheck keeps history
{
  const j = {
    id: 'fixture', topic: 't', category: 'ai-tools',
    artifacts: { draft: { body: 'Body v1 with an error.' }, research: { sources: [] } },
    log: [],
  };
  const mkLlm = (data) => ({ run: async () => ({ data, costUsd: 0 }) });
  const noop = () => {};
  const first = {
    claims: [{ text: 'old', status: 'unverified', resolution: decision }],
    verdict: 'needs_human_review',
    corrections: [{ find: 'an error', replace: 'a fix' }],
  };
  await factCheckAgent({ job: j, llm: mkLlm(first), log: noop });
  ok('the first fact-check lands its ledger and applies the correction',
    j.artifacts.factcheck === first && j.artifacts.draft.body === 'Body v1 with a fix.'
    && j.artifacts.draftPreCorrection.body === 'Body v1 with an error.',
    JSON.stringify(j.artifacts.draft.body));
  const second = {
    claims: [{ text: 'new', status: 'verified' }],
    verdict: 'pass',
    corrections: [{ find: 'a fix', replace: 'a verified fix' }],
  };
  await factCheckAgent({ job: j, llm: mkLlm(second), log: noop });
  ok('a recheck replaces the ledger with the new verdict', j.artifacts.factcheck === second);
  ok('the earlier ledger stays in the audit trail with its resolutions',
    j.artifacts.factcheckHistory?.length === 1 && j.artifacts.factcheckHistory[0] === first
    && j.artifacts.factcheckHistory[0].claims[0].resolution === decision);
  ok('each pass archives its own pre-correction text',
    j.artifacts.draftPreCorrectionHistory?.length === 1
    && j.artifacts.draftPreCorrectionHistory[0].body === 'Body v1 with an error.'
    && j.artifacts.draftPreCorrection.body === 'Body v1 with a fix.',
    JSON.stringify(j.artifacts.draftPreCorrection));
}

console.log(`\n${checks - failures}/${checks} job-state checks passed${failures ? ` — ${failures} FAILED` : ''}`);
if (failures) process.exit(1);
