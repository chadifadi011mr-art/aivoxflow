#!/usr/bin/env node
// Publishing scheduler.
//
//   node agents/scheduler.mjs --due              # what is ready to be written now
//   node agents/scheduler.mjs --once             # generate + queue everything due
//   node agents/scheduler.mjs --once --deploy    # …and build + upload to the host
//   node agents/scheduler.mjs --unpublish <slug> # pull a live article (quarantine, rebuild)
//   node agents/scheduler.mjs --daemon --interval 30
//
// "Due" means: the slot is within the lead window (default 24h). The article is
// written now, dated for the slot, and the site build keeps it hidden until that
// date. A rebuild at or after the slot publishes it.
//
// Emergency stop: if content/SCHEDULER_STOP exists, every cycle halts before it
// touches anything. Delete the file to resume.
//
// agents/.local.env is loaded automatically (a CI runner's real env wins), so an
// unattended `node` call still has the provider keys.
import { parseArgs } from 'node:util';
import {
  readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync, readdirSync, renameSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { repo } from './lib/job.mjs';
import { describeSlot } from './lib/calendar.mjs';
import { stopExists, STOP_HINT } from './lib/stop.mjs';

// Local secrets (agents/.local.env) are loaded here so the scheduler can run
// unattended from a bare `node` invocation — a CI runner supplies these same
// names as real environment variables, which always win over the file.
(() => {
  const f = path.join(repo, 'agents', '.local.env');
  if (!existsSync(f)) return;
  for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const i = t.indexOf('=');
    const name = t.slice(0, i).trim();
    const value = t.slice(i + 1).trim();
    if (name && process.env[name] === undefined) process.env[name] = value;
  }
})();

const { values: args } = parseArgs({
  options: {
    once: { type: 'boolean', default: false },
    due: { type: 'boolean', default: false },
    daemon: { type: 'boolean', default: false },
    build: { type: 'boolean', default: false },
    deploy: { type: 'boolean', default: false },
    unpublish: { type: 'string' },
    interval: { type: 'string', default: '30' },
    lead: { type: 'string', default: '24' },
    limit: { type: 'string', default: '1' },
  },
  allowPositionals: true,
});

const C = process.stdout.isTTY
  ? { dim: '\x1b[2m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', bold: '\x1b[1m', off: '\x1b[0m' }
  : { dim: '', red: '', green: '', yellow: '', bold: '', off: '' };

const calendarFile = path.join(repo, 'content', 'calendar.json');
const logFile = path.join(repo, 'content', 'scheduler.log');
const leadMs = (Number(args.lead) || 24) * 3600000;
const limit = Math.max(1, Number(args.limit) || 1);

const log = (msg) => {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(msg);
  try {
    mkdirSync(path.dirname(logFile), { recursive: true });
    appendFileSync(logFile, `${line}\n`, 'utf8');
  } catch { /* logging must never break the run */ }
};

const readCal = () => {
  if (!existsSync(calendarFile)) return { generatedAt: null, items: [] };
  try { return JSON.parse(readFileSync(calendarFile, 'utf8')); } catch { return { generatedAt: null, items: [] }; }
};
const writeCal = (cal) => writeFileSync(calendarFile, `${JSON.stringify(cal, null, 2)}\n`, 'utf8');

const dueItems = (cal) => {
  const now = Date.now();
  return cal.items
    .filter((it) => it.status === 'planned')
    .filter((it) => new Date(it.slot.at).getTime() - leadMs <= now)
    .sort((a, b) => a.slot.at.localeCompare(b.slot.at));
};

function showDue() {
  const cal = readCal();
  const due = dueItems(cal);
  if (!cal.items.length) {
    console.log('Calendar is empty. Run: node agents/plan.mjs');
    return;
  }
  const planned = cal.items.filter((i) => i.status === 'planned');
  console.log(`${cal.items.length} item(s) · ${planned.length} planned · ${due.length} due now\n`);
  for (const it of cal.items) {
    const flag = it.status === 'planned' && due.some((d) => d.id === it.id) ? `${C.green}DUE${C.off}` : it.status;
    console.log(`  ${String(flag).padEnd(20)} ${it.slot.at}  ${it.title}`);
  }
}

function runOne(item) {
  log(`${C.bold}Generating${C.off} ${item.title}`);
  log(`  slot ${describeSlot(item.slot)}`);

  const res = spawnSync(process.execPath, [
    path.join(repo, 'agents', 'run.mjs'),
    '--topic', item.title,
    '--category', item.category,
    '--slot', item.slot.at,
    '--publish',
    '--force',
    ...(item.notes ? ['--notes', item.notes] : []),
    ...(item.sourcesFile ? ['--sources', item.sourcesFile] : []),
  ], { cwd: repo, encoding: 'utf8', env: process.env });

  const out = `${res.stdout || ''}${res.stderr || ''}`;
  try { appendFileSync(logFile, `${out}\n`, 'utf8'); } catch { /* ignore */ }

  if (res.status === 0) { item.status = 'done'; log(`  ${C.green}✓ published${C.off}`); return true; }
  if (res.status === 3) {
    item.status = 'needs_review';
    const raw = (out.match(/NEEDS HUMAN REVIEW[^\n]*/) || [''])[0].replace(/\x1b\[[0-9;]*m/g, '');
    item.reason = raw.replace(/^NEEDS HUMAN REVIEW\s*[—–-]?\s*/, '').trim() || 'gate failure';
    log(`  ${C.yellow}⚠ needs review${C.off} — ${item.reason}`);
    return false;
  }
  item.status = 'failed';
  log(`  ${C.red}✗ failed${C.off} (exit ${res.status})`);
  return false;
}

function cycle() {
  if (stopExists()) {
    log(`${C.yellow}paused${C.off} — ${STOP_HINT}`);
    return 0;
  }
  const cal = readCal();
  const due = dueItems(cal);
  if (!due.length) { log(`${C.dim}nothing due${C.off}`); return 0; }

  let published = 0;
  for (const item of due.slice(0, limit)) {
    if (runOne(item)) published++;
  }
  writeCal(cal);

  // --deploy runs the full production build + upload itself (deploy.mjs sets
  // AIVOXFLOW_SITE_URL and refuses a preview build), so we skip the local
  // preview build here to avoid a redundant, non-deployable rebuild.
  if (published && args.deploy) {
    log('Deploying to the host…');
    const d = spawnSync(process.execPath, [path.join(repo, 'deploy', 'deploy.mjs')], { cwd: repo, encoding: 'utf8', env: process.env });
    try { appendFileSync(logFile, `${d.stdout || ''}${d.stderr || ''}\n`, 'utf8'); } catch { /* ignore */ }
    if (d.status === 0) log(`${C.green}✓ deployed${C.off}`);
    else log(`${C.red}✗ deploy exited ${d.status}${C.off} — files may be uploaded; see content/scheduler.log`);
  } else if (published && args.build) {
    log('Rebuilding dist/…');
    const b = spawnSync(process.execPath, [path.join(repo, 'site', 'build.mjs')], { cwd: repo, encoding: 'utf8', env: process.env });
    log(b.status === 0 ? `${C.green}✓ build ok${C.off}` : `${C.red}✗ build failed${C.off}\n${b.stderr}`);
  }
  return published;
}

// Pull a published article: quarantine it (never delete), rebuild, and — with
// --deploy — push the removal to the live host. This is the rollback control
// autonomous publishing depends on: any article can be removed in one command.
function unpublish(slug) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) { console.error(`Invalid slug "${slug}".`); process.exit(2); }
  const dir = path.join(repo, 'site', 'data', 'articles');
  const file = path.join(dir, `${slug}.json`);
  if (!existsSync(file)) { console.error(`No published article at site/data/articles/${slug}.json`); process.exit(2); }

  const quarantine = path.join(repo, 'content', 'unpublished');
  mkdirSync(quarantine, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
  renameSync(file, path.join(quarantine, `${stamp}-${slug}.json`));

  // Its hero artwork moves too, so nothing references a removed article.
  const assets = path.join(repo, 'site', 'assets-src', 'articles', slug);
  if (existsSync(assets)) renameSync(assets, path.join(quarantine, `${stamp}-${slug}-assets`));

  log(`${C.bold}Unpublished${C.off} ${slug} → content/unpublished/${stamp}-${slug}.json`);

  log('Rebuilding dist/…');
  const b = spawnSync(process.execPath, [path.join(repo, 'site', 'build.mjs')], { cwd: repo, encoding: 'utf8', env: process.env });
  if (b.status !== 0) { log(`${C.red}✗ build failed${C.off}\n${b.stderr}`); process.exit(1); }
  log(`${C.green}✓ build ok${C.off}`);

  if (args.deploy) {
    log('Deploying removal to the host…');
    const d = spawnSync(process.execPath, [path.join(repo, 'deploy', 'deploy.mjs')], { cwd: repo, encoding: 'utf8', env: process.env });
    log(d.status === 0 ? `${C.green}✓ deployed${C.off}` : `${C.red}✗ deploy exited ${d.status}${C.off} — see output above`);
  } else {
    log(`${C.dim}Not uploaded — re-run with --deploy to push the removal to the live site.${C.off}`);
  }
  process.exit(0);
}

if (args.due) { showDue(); process.exit(0); }

if (args.unpublish) { unpublish(args.unpublish); }

if (args.once) {
  const n = cycle();
  console.log(`\n${n} article(s) published. Calendar: content/calendar.json`);
  process.exit(0);
}

if (args.daemon) {
  const every = Math.max(5, Number(args.interval) || 30) * 60000;
  log(`${C.bold}Scheduler started${C.off} — every ${every / 60000} min, lead ${leadMs / 3600000}h, max ${limit}/cycle`);
  const tick = () => { try { cycle(); } catch (e) { log(`${C.red}cycle error: ${e.message}${C.off}`); } };
  tick();
  setInterval(tick, every);
} else {
  console.log('Usage: node agents/scheduler.mjs [--due | --once [--build|--deploy] | --unpublish <slug> [--deploy] | --daemon [--interval 30]]');
  process.exit(2);
}
