#!/usr/bin/env node
// Publishing scheduler.
//
//   node agents/scheduler.mjs --due              # what is ready to be written now
//   node agents/scheduler.mjs --once             # generate + queue everything due
//   node agents/scheduler.mjs --once --build     # …and rebuild dist/ afterwards
//   node agents/scheduler.mjs --daemon --interval 30
//
// "Due" means: the slot is within the lead window (default 24h). The article is
// written now, dated for the slot, and the site build keeps it hidden until that
// date. A rebuild at or after the slot publishes it.
import { parseArgs } from 'node:util';
import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { repo } from './lib/job.mjs';
import { describeSlot } from './lib/calendar.mjs';

const { values: args } = parseArgs({
  options: {
    once: { type: 'boolean', default: false },
    due: { type: 'boolean', default: false },
    daemon: { type: 'boolean', default: false },
    build: { type: 'boolean', default: false },
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
  const cal = readCal();
  const due = dueItems(cal);
  if (!due.length) { log(`${C.dim}nothing due${C.off}`); return 0; }

  let published = 0;
  for (const item of due.slice(0, limit)) {
    if (runOne(item)) published++;
  }
  writeCal(cal);

  if (published && args.build) {
    log('Rebuilding dist/…');
    const b = spawnSync(process.execPath, [path.join(repo, 'site', 'build.mjs')], { cwd: repo, encoding: 'utf8', env: process.env });
    log(b.status === 0 ? `${C.green}✓ build ok${C.off}` : `${C.red}✗ build failed${C.off}\n${b.stderr}`);
  }
  return published;
}

if (args.due) { showDue(); process.exit(0); }

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
  console.log('Usage: node agents/scheduler.mjs [--due | --once [--build] | --daemon [--interval 30]]');
  process.exit(2);
}
