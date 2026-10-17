#!/usr/bin/env node
// Builds the publishing calendar from the topic backlog.
//
//   node agents/plan.mjs                 # plan the next 7 slots
//   node agents/plan.mjs --slots 12
//   node agents/plan.mjs --show          # print the current calendar
//
// The planner never invents topics: it only schedules seeds from
// site/data/topics.json that the site has not already covered, rotating
// categories so consecutive articles are not all from one section.
import { parseArgs } from 'node:util';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { repo, jobsDir } from './lib/job.mjs';
import { nextSlots, describeSlot } from './lib/calendar.mjs';

const { values: args } = parseArgs({
  options: {
    slots: { type: 'string', default: '7' },
    show: { type: 'boolean', default: false },
  },
  allowPositionals: true,
});

const calendarFile = path.join(repo, 'content', 'calendar.json');
const readJson = (p, d) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return d; } };
const norm = (s) => String(s).toLowerCase().replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim();

if (args.show) {
  const cal = readJson(calendarFile, { items: [] });
  if (!cal.items.length) { console.log('Calendar is empty. Run: node agents/plan.mjs'); process.exit(0); }
  console.log(`${cal.items.length} planned item(s)\n`);
  for (const it of cal.items) {
    console.log(`  ${it.status.padEnd(12)} ${it.slot.at}  ${it.category.padEnd(20)} ${it.title}`);
  }
  process.exit(0);
}

const count = Math.max(1, Math.min(60, Number(args.slots) || 7));

// ---- what already exists
const articleDir = path.join(repo, 'site', 'data', 'articles');
const existing = existsSync(articleDir)
  ? readdirSync(articleDir).filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(path.join(articleDir, f), 'utf8')))
  : [];
const usedTitles = new Set(existing.map((a) => norm(a.title)));
const usedIds = new Set();

const cal = readJson(calendarFile, { generatedAt: null, items: [] });
for (const it of cal.items) {
  if (it.status === 'planned' || it.status === 'done' || it.status === 'generated') usedIds.add(it.id);
}

// Job history also counts: a topic that failed review should not be re-queued
// silently under the same id.
if (existsSync(jobsDir)) {
  for (const f of readdirSync(jobsDir).filter((x) => x.endsWith('.json') && !x.startsWith('_'))) {
    try {
      const j = JSON.parse(readFileSync(path.join(jobsDir, f), 'utf8'));
      usedTitles.add(norm(j.topic));
    } catch { /* ignore malformed */ }
  }
}

const backlog = readJson(path.join(repo, 'site', 'data', 'topics.json'), { topics: [] }).topics || [];
const available = backlog
  .filter((t) => !usedIds.has(t.id) && !usedTitles.has(norm(t.title)))
  .sort((a, b) => (a.priority || 9) - (b.priority || 9));

if (!available.length) {
  console.log('No unused topics left. Add more seeds to site/data/topics.json.');
  process.exit(0);
}

// ---- rotate categories
const picked = [];
const byCat = new Map();
for (const t of available) {
  if (!byCat.has(t.category)) byCat.set(t.category, []);
  byCat.get(t.category).push(t);
}
const cats = [...byCat.keys()];
let lastCat = cal.items.length ? cal.items[cal.items.length - 1].category : null;
while (picked.length < count && [...byCat.values()].some((v) => v.length)) {
  const order = cats.filter((c) => c !== lastCat).concat(lastCat ? [lastCat] : []);
  for (const c of order) {
    const pool = byCat.get(c);
    if (!pool || !pool.length) continue;
    picked.push(pool.shift());
    lastCat = c;
    if (picked.length >= count) break;
  }
}

const slots = nextSlots({ count: picked.length, from: new Date(), minLeadHours: 12 });
const items = picked.map((t, i) => ({
  id: t.id,
  title: t.title,
  category: t.category,
  intent: t.intent || '',
  notes: t.notes || '',
  slot: slots[i],
  status: 'planned',
  createdAt: new Date().toISOString(),
}));

const merged = { generatedAt: new Date().toISOString(), items: [...cal.items, ...items] };
mkdirSync(path.dirname(calendarFile), { recursive: true });
writeFileSync(calendarFile, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');

console.log(`Planned ${items.length} article(s):\n`);
for (const it of items) {
  console.log(`  ${describeSlot(it.slot)}`);
  console.log(`    ${it.category.padEnd(20)} ${it.title}`);
}
console.log(`\nCalendar: content/calendar.json  ·  run "node agents/scheduler.mjs --once" when a slot is due.`);
