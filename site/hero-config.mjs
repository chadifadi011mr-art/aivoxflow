// Shared hero configuration — single source of truth for both renderers:
//   site/hero.mjs    (Approach B — deterministic vector scene, fallback)
//   site/hero-ai.mjs (Approach C — AI art + editorial text overlay)
//
// `pre`/`hl` split the title so the key phrase can be highlighted.
// `labels` are short phrases distilled from the article's own `##` sections —
// never invented. `glyph` picks the category motif drawn inside the core
// (Approach B only). Art for Approach C lives in docs/art/<slug>.jpg.
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(here, '..');

export const HEROES = [
  {
    slug: 'choose-an-ai-writing-tool',
    pre: 'How to Choose an', hl: 'AI Writing Tool',
    sub: 'A Practical Checklist', glyph: 'tools',
    labels: [
      { c: '#FF5C5C', t: 'Define Your Task' },
      { c: '#FFB23F', t: 'Check the Free Tier' },
      { c: '#3DDC97', t: 'Read the Data Terms' },
      { c: '#4C8DFF', t: 'Price Year Two' },
    ],
  },
];

HEROES.push(
{slug:`prompt-patterns-that-improve-output`,pre:``,hl:`Prompt Patterns`,post:`That Actually Improve AI Output`,sub:`Four Repeatable Structures`,glyph:`tutorials`,labels:[{c:`#FF5C5C`,t:`Give Context First`},{c:`#FFB23F`,t:`Assign a Real Role`},{c:`#3DDC97`,t:`Show One Example`},{c:`#4C8DFF`,t:`Constrain Output`}]},
{slug:`map-the-task-before-automating`,pre:`Before You`,hl:`Automate`,post:``,sub:`Map the Repetitive Task First`,glyph:`automation-agents`,labels:[{c:`#FF5C5C`,t:`Write Every Step`},{c:`#FFB23F`,t:`Score Each Step`},{c:`#3DDC97`,t:`Automate Handoffs`},{c:`#4C8DFF`,t:`Know the Off-Switch`}]},
{slug:`ai-assistants-vs-traditional-software`,pre:``,hl:`AI Assistants`,post:`vs Traditional Software`,sub:`What Actually Changes`,glyph:`comparisons`,labels:[{c:`#FF5C5C`,t:`Assistants Replace`},{c:`#FFB23F`,t:`Software Still Wins`},{c:`#3DDC97`,t:`The Decision Rule`},{c:`#4C8DFF`,t:`The Honest Summary`}]},
{slug:`how-to-verify-ai-news`,pre:`How to Verify`,hl:`AI News`,post:``,sub:`A Source-First Method`,glyph:`ai-news`,labels:[{c:`#FF5C5C`,t:`Find the Source`},{c:`#FFB23F`,t:`Read What It Says`},{c:`#3DDC97`,t:`Cross-Check Sources`},{c:`#4C8DFF`,t:`The Traps to Know`}]},
{slug:`browser-based-vs-installed-ai-tools`,pre:`Browser-Based AI Tools vs`,hl:`Installed Apps`,post:``,sub:`How to Decide`,glyph:`software-web`,labels:[{c:`#FF5C5C`,t:`Browser Strengths`},{c:`#FFB23F`,t:`Installed Apps Add`},{c:`#3DDC97`,t:`Decision Checklist`},{c:`#4C8DFF`,t:`A Hybrid That Works`}]},
{slug:`compare-ai-tool-pricing`,pre:`AI Tool`,hl:`Pricing`,post:``,sub:`How to Compare Costs and Avoid Traps`,glyph:`tools`,labels:[{c:`#FF5C5C`,t:`Billing Models`},{c:`#FFB23F`,t:`Output Costs 3-8x`},{c:`#3DDC97`,t:`Second-Year Jumps`},{c:`#4C8DFF`,t:`Verify It First`}]},
);

export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Editorial eyebrow: real category name + real read time from the article JSON.
const catName = (() => {
  try {
    const cs = JSON.parse(readFileSync(path.join(repo, 'site', 'data', 'categories.json'), 'utf8')).categories;
    return Object.fromEntries(cs.map((c) => [c.slug, c.name]));
  } catch { return {}; }
})();

export function meta(slug) {
  try {
    // Article files are numbered (01-<slug>.json), so locate by slug suffix.
    const dir = path.join(repo, 'site', 'data', 'articles');
    const file = readdirSync(dir).find((f) => f.endsWith('.json') && f.replace(/\.json$/, '').endsWith(slug));
    if (!file) return { cat: 'AIVOXFLOW', mins: 4 };
    const a = JSON.parse(readFileSync(path.join(dir, file), 'utf8'));
    const mins = Math.max(1, Math.round(a.body.split(/\s+/).length / 200));
    return { cat: catName[a.category] || a.category || 'AIVOXFLOW', mins };
  } catch { return { cat: 'AIVOXFLOW', mins: 4 }; }
}
