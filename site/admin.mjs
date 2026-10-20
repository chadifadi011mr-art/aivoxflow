#!/usr/bin/env node
// AIVOXFLOW operator status page — LOCAL ONLY, never deployed.
//
// Why local-only: the pipeline's operational state (planned topics, slot
// statuses, the emergency-stop flag) must not be published on the public
// static host, which has no authentication. This script renders a
// self-contained HTML snapshot to the repo root; open it locally, or re-run
// `npm run admin` after each `git pull`. It is git-ignored and kept out of
// dist/, so `deploy/deploy.mjs` can never upload it.
//
// What it shows: REPOSITORY state only — the schedule, the stop flag, and the
// published articles. Run history, failures and provider spend live in GitHub
// Actions (Actions → Content pipeline) because CI runners are ephemeral.
//
// Usage: node site/admin.mjs   (or `npm run admin`)

import { existsSync, readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(root, '..');
const out = path.join(repo, 'admin-status.html');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------------------------------------------------------------- state
const stopFile = path.join(repo, 'content', 'SCHEDULER_STOP');
const stopped = existsSync(stopFile);
const STOP_HINT_TEXT = 'content/SCHEDULER_STOP exists — the autonomous pipeline is paused. Delete that file to resume generating and publishing.';

const calFile = path.join(repo, 'content', 'calendar.json');
const cal = existsSync(calFile) ? JSON.parse(readFileSync(calFile, 'utf8')) : { items: [] };

const LEAD_MS = 24 * 3600000; // match agents/scheduler.mjs default --lead 24
const now = Date.now();
const isDue = (it) => it.status === 'planned' && new Date(it.slot.at).getTime() - LEAD_MS <= now;
const byStatus = (s) => cal.items.filter((i) => i.status === s);
const due = cal.items.filter(isDue).sort((a, b) => a.slot.at.localeCompare(b.slot.at));

const artDir = path.join(repo, 'site', 'data', 'articles');
const articles = (existsSync(artDir) ? readdirSync(artDir).filter((f) => f.endsWith('.json')) : [])
  .map((f) => JSON.parse(readFileSync(path.join(artDir, f), 'utf8')))
  .sort((a, b) => (b.published || '').localeCompare(a.published || ''));

// Pipeline defaults as shipped in .github/workflows/content.yml. GitHub Actions
// Vars override these at runtime; they are shown here for orientation only.
const pipeline = [
  ['Schedule', 'cron 04:00 UTC daily (+ manual workflow_dispatch)'],
  ['LLM', "gemini · gemini-flash-latest (AIVOXFLOW_AI_PROVIDER / _MODEL Var)"],
  ['Search', 'tavily (keyless, rate-limited)'],
  ['Images', 'pollinations · flux (free, no GPU)'],
  ['Daily budget cap', '$2 (AIVOXFLOW_AI_BUDGET_USD_DAILY Var)'],
  ['Deploy', 'FTP → aivoxflow.unaux.com (htdocs)'],
];

const STATUS_CLASS = {
  planned: 'st-planned', due: 'st-due', done: 'st-done',
  needs_review: 'st-review', failed: 'st-failed',
};
const statusOf = (it) => (isDue(it) ? 'due' : it.status);

// ---------------------------------------------------------------- render
const rows = cal.items
  .slice()
  .sort((a, b) => a.slot.at.localeCompare(b.slot.at))
  .map((it, i) => {
    const st = statusOf(it);
    return `<tr>
      <td class="num">${i + 1}</td>
      <td class="nowrap">${esc(it.slot.at.replace('T', ' ').replace(':00Z', 'Z'))}</td>
      <td>${esc(it.title)}</td>
      <td class="nowrap">${esc(it.category)}</td>
      <td><span class="badge ${STATUS_CLASS[st] || 'st-planned'}">${esc(st)}</span></td>
      <td class="reason">${esc(it.reason || '')}</td>
    </tr>`;
  }).join('\n');

const artRows = articles.map((a) => `<tr>
      <td class="nowrap">${esc(a.published || '—')}</td>
      <td><a href="/articles/${esc(a.slug)}/">${esc(a.title)}</a></td>
      <td class="nowrap">${esc(a.category)}</td>
    </tr>`).join('\n');

const stat = (label, value, cls = '') => `<div class="stat ${cls}"><span class="stat-n">${value}</span><span class="stat-l">${label}</span></div>`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>AIVOXFLOW · Operator Status</title>
<style>
  :root { --navy:#08152f; --navy800:#0e2049; --electric:#1e6bff; --electric-l:#4c8dff;
          --white:#fff; --g50:#f6f8fb; --g100:#e9edf4; --g200:#d6dce7; --g600:#59627a;
          --g800:#232a3b; --g900:#111524; --green:#137a3d; --amber:#a15c00; --red:#b42318; }
  * { box-sizing: border-box; }
  body { margin:0; font:15px/1.55 "Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;
         color:var(--g900); background:var(--g50); }
  header { background:var(--navy); color:var(--white); padding:22px 28px; }
  header h1 { margin:0; font-size:20px; letter-spacing:.02em; }
  header .sub { color:#98a1b3; font-size:13px; margin-top:4px; }
  .local { display:inline-block; background:var(--navy800); color:var(--electric-l);
           border:1px solid #163064; border-radius:999px; padding:2px 10px; font-size:12px; margin-top:8px; }
  main { max-width:1040px; margin:0 auto; padding:24px 20px 60px; }
  section { background:var(--white); border:1px solid var(--g200); border-radius:12px;
            padding:18px 20px; margin-bottom:18px; }
  h2 { margin:0 0 14px; font-size:15px; text-transform:uppercase; letter-spacing:.06em; color:var(--g600); }
  .banner { display:flex; gap:12px; align-items:center; border-radius:12px; padding:16px 20px; margin-bottom:18px; }
  .banner.run { background:#eaf7ef; border:1px solid #bfe6cd; }
  .banner.stop { background:#fdeceb; border:1px solid #f4c2be; }
  .banner b { font-size:16px; }
  .banner .cmd { font-family:ui-monospace,Menlo,Consolas,monospace; font-size:12.5px; color:var(--g600); }
  .stats { display:flex; flex-wrap:wrap; gap:12px; }
  .stat { flex:1 1 120px; background:var(--g50); border:1px solid var(--g200); border-radius:10px; padding:12px 14px; text-align:center; }
  .stat-n { display:block; font-size:24px; font-weight:700; }
  .stat-l { display:block; font-size:12px; color:var(--g600); text-transform:uppercase; letter-spacing:.04em; }
  .stat.due .stat-n { color:var(--amber); } .stat.review .stat-n { color:var(--amber); }
  .stat.failed .stat-n { color:var(--red); } .stat.done .stat-n { color:var(--green); }
  table { width:100%; border-collapse:collapse; font-size:14px; }
  th,td { text-align:left; padding:8px 10px; border-bottom:1px solid var(--g100); vertical-align:top; }
  th { color:var(--g600); font-size:12px; text-transform:uppercase; letter-spacing:.04em; }
  .num { color:var(--g600); width:34px; } .nowrap { white-space:nowrap; }
  .reason { color:var(--g600); font-size:13px; }
  a { color:var(--electric); }
  .badge { display:inline-block; padding:2px 9px; border-radius:999px; font-size:12px; font-weight:600; }
  .st-planned { background:var(--g100); color:var(--g800); }
  .st-due { background:#fff3e0; color:var(--amber); }
  .st-done { background:#eaf7ef; color:var(--green); }
  .st-review { background:#fff3e0; color:var(--amber); }
  .st-failed { background:#fdeceb; color:var(--red); }
  dl.cfg { margin:0; display:grid; grid-template-columns:180px 1fr; gap:6px 16px; font-size:14px; }
  dl.cfg dt { color:var(--g600); } dl.cfg dd { margin:0; }
  code, .cmdline { font-family:ui-monospace,Menlo,Consolas,monospace; background:var(--g50);
                   border:1px solid var(--g200); border-radius:6px; padding:1px 6px; font-size:13px; }
  pre { background:var(--navy); color:#e9edf4; border-radius:10px; padding:14px 16px; overflow:auto;
        font-size:13px; line-height:1.6; }
  pre .c { color:#98a1b3; }
  .note { color:var(--g600); font-size:13px; margin-top:10px; }
  footer { color:var(--g600); font-size:12.5px; text-align:center; padding:8px 0 30px; }
</style>
</head>
<body>
<header>
  <h1>AIVOXFLOW · Operator Status</h1>
  <div class="sub">Autonomous publishing — schedule, stop flag, published articles.</div>
  <span class="local">local only · never deployed · regenerate with <code style="background:none;color:#4c8dff;border:0;padding:0">npm run admin</code></span>
</header>
<main>
  <div class="banner ${stopped ? 'stop' : 'run'}">
    <div><b>${stopped ? 'PAUSED' : 'RUNNING'}</b></div>
    <div class="cmd">${stopped ? esc(STOP_HINT_TEXT) : 'Autonomous pipeline is active (next cron 04:00 UTC).'}</div>
  </div>

  <section>
    <h2>Scheduler</h2>
    <div class="stats">
      ${stat('slots', cal.items.length)}
      ${stat('due now', due.length, 'due')}
      ${stat('planned', byStatus('planned').length)}
      ${stat('needs review', byStatus('needs_review').length, 'review')}
      ${stat('failed', byStatus('failed').length, 'failed')}
      ${stat('done', byStatus('done').length, 'done')}
      ${stat('published', articles.length, 'done')}
    </div>
    <p class="note">Due = planned and inside the 24h lead window. "needs review" and "failed" slots will not retry automatically.</p>
  </section>

  <section>
    <h2>Content calendar (${cal.items.length})</h2>
    <table>
      <thead><tr><th>#</th><th>Slot (UTC)</th><th>Title</th><th>Category</th><th>Status</th><th>Reason</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6" class="reason">No calendar items — run <code>npm run plan</code>.</td></tr>'}</tbody>
    </table>
  </section>

  <section>
    <h2>Published articles (${articles.length})</h2>
    <table>
      <thead><tr><th>Date</th><th>Title</th><th>Category</th></tr></thead>
      <tbody>${artRows || '<tr><td colspan="3" class="reason">None yet.</td></tr>'}</tbody>
    </table>
  </section>

  <section>
    <h2>Pipeline configuration (defaults)</h2>
    <dl class="cfg">${pipeline.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
    <p class="note">Values come from GitHub Actions <b>Vars/Secrets</b>; edit them there (Settings → Secrets and variables → Actions).</p>
  </section>

  <section>
    <h2>Operator commands</h2>
    <pre><span class="c"># emergency stop (pause all generation + publishing)</span>
touch content/SCHEDULER_STOP        <span class="c"># commit to pause CI too</span>

<span class="c"># resume</span>
rm content/SCHEDULER_STOP

<span class="c"># pull a live article (quarantines, rebuilds, redeploys)</span>
node agents/scheduler.mjs --unpublish &lt;slug&gt; --deploy

<span class="c"># schedule / due view</span>
node agents/scheduler.mjs --due

<span class="c"># trigger the pipeline now (same as the daily cron)</span>
gh workflow run content.yml -R &lt;owner/repo&gt;

<span class="c"># run history, failures, logs</span>
gh run list -R &lt;owner/repo&gt; --workflow content.yml</pre>
  </section>

  <footer>Run history and provider spend are not shown here (CI runners are ephemeral) — see GitHub Actions → Content pipeline.</footer>
</main>
</body>
</html>
`;

writeFileSync(out, html, 'utf8');

const stat0 = statSync(out);
console.log(`Wrote ${path.relative(repo, out)} (${stat0.size} bytes).`);
console.log(`  stop flag : ${stopped ? 'PAUSED' : 'running'}`);
console.log(`  slots     : ${cal.items.length} (due now: ${due.length})`);
console.log(`  published : ${articles.length}`);
console.log('Open it locally — it is git-ignored and never deployed.');
