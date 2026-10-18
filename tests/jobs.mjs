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
import { runGates } from '../agents/lib/gates.mjs';

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
const sourcing = (claims) => runGates({ draft, research, factcheck: { claims }, seo: {}, corpus: [] })
  .gates.find((g) => g.name === 'sourcing');

const blocked = sourcing([{ text: 'dubious', status: 'unverified' }]);
ok('sourcing blocks an unresolved claim', blocked.pass === false && /not verified and not human-resolved/.test(blocked.findings.join(' ')),
  JSON.stringify(blocked.findings));

const cleared = sourcing([{ text: 'dubious', status: 'unverified', resolved: true, resolution: decision }]);
ok('sourcing accepts a human-resolved claim', cleared.pass === true, JSON.stringify(cleared.findings));

const empty = sourcing([]);
ok('sourcing still blocks an empty ledger', empty.pass === false && /No claim ledger/.test(empty.findings.join(' ')));

console.log(`\n${checks - failures}/${checks} job-state checks passed${failures ? ` — ${failures} FAILED` : ''}`);
if (failures) process.exit(1);
