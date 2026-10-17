// Quality gates. Code, not opinions.
//
// A draft only reaches "scheduled" when every gate passes. Gates are grouped by
// what they protect: the reader (value, structure), the truth (sourcing,
// honesty), the search engine (SEO, AI-first), and the brand (originality).
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { repo } from './job.mjs';

const MIN_WORDS = 1400;
const MAX_WORDS = 3600;
const MIN_H2 = 6;
const MIN_SOURCES = 4;
const MIN_INTERNAL_LINKS = 3;
const MAX_SHINGLE_OVERLAP = 0.12;

const words = (s) => s.trim().split(/\s+/).filter(Boolean);
const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

function shingles(text, n = 5) {
  const w = norm(text).split(' ').filter(Boolean);
  const set = new Set();
  for (let i = 0; i + n <= w.length; i++) set.add(w.slice(i, i + n).join(' '));
  return set;
}

function overlap(a, b) {
  if (!a.size || !b.size) return 0;
  let hit = 0;
  for (const s of a) if (b.has(s)) hit++;
  return hit / Math.min(a.size, b.size);
}

export function loadCorpus() {
  const dir = path.join(repo, 'site', 'data', 'articles');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => {
    const a = JSON.parse(readFileSync(path.join(dir, f), 'utf8'));
    return { slug: a.slug, title: a.title, description: a.description, body: a.body, tags: a.tags || [] };
  });
}

const gate = (name, label, severity = 'blocker') => ({ name, label, severity, pass: true, findings: [] });
const fail = (g, msg) => { g.pass = false; g.findings.push(msg); };
const warn = (g, msg) => { g.findings.push(`(advisory) ${msg}`); };

export function runGates({ draft, research = {}, factcheck = {}, seo = {}, corpus = [] }) {
  const gates = [];
  const body = draft.body || '';
  const w = words(body);
  const h2s = [...body.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1].trim());
  const paras = body.split(/\n{2,}/).filter((p) => p.trim() && !p.startsWith('#') && !p.startsWith('|'));

  // ---------------------------------------------------------------- 1 structure
  {
    const g = gate('structure', 'Long-form structure a reader can navigate');
    if (w.length < MIN_WORDS) fail(g, `Body is ${w.length} words; a competitive long-form piece needs ${MIN_WORDS}+.`);
    if (w.length > MAX_WORDS) fail(g, `Body is ${w.length} words; trim below ${MAX_WORDS} or split into two articles.`);
    if (h2s.length < MIN_H2) fail(g, `Only ${h2s.length} H2 sections; needs ${MIN_H2}+ to cover the topic honestly.`);
    const dupes = h2s.filter((h, i) => h2s.findIndex((x) => x.toLowerCase() === h.toLowerCase()) !== i);
    if (dupes.length) fail(g, `Duplicate section headings: ${dupes.join(', ')}`);
    const longParas = paras.filter((p) => words(p).length > 110);
    if (longParas.length > 2) fail(g, `${longParas.length} paragraphs exceed 110 words — unreadable on mobile.`);
    if (!draft.takeaways?.length) warn(g, 'No key takeaways block.');
    gates.push(g);
  }

  // ---------------------------------------------------------------- 2 sourcing
  {
    const g = gate('sourcing', 'Every material claim is traceable to a source');
    if (research.mock) fail(g, 'Research was produced by the mock provider — mock output can never be published.');
    const sources = research.sources || [];
    const unique = [...new Set(sources.map((s) => s.url))];
    if (unique.length < MIN_SOURCES) fail(g, `${unique.length} distinct sources; needs ${MIN_SOURCES}+ primary/reputable sources.`);
    if (sources.some((s) => !/^https:\/\//.test(s.url))) fail(g, 'Every source URL must be https.');
    const unread = sources.filter((s) => !s.read);
    if (unread.length) warn(g, `${unread.length} source(s) were listed but never read.`);

    const claims = factcheck.claims || [];
    if (!claims.length) fail(g, 'No claim ledger: the fact-check stage produced nothing to verify.');
    const unverified = claims.filter((c) => c.status !== 'verified');
    if (unverified.length) fail(g, `${unverified.length} claim(s) not verified: ${unverified.slice(0, 3).map((c) => c.text).join(' | ')}`);

    // Every sentence carrying a number, price or percentage must be in the ledger.
    const numeric = body.split(/(?<=[.!?])\s+/).filter((s) => /\d/.test(s) && !/^##/.test(s));
    const claimText = norm(claims.map((c) => c.text).join(' '));
    const untracked = numeric.filter((s) => {
      const key = norm(s).split(' ').slice(0, 8).join(' ');
      return key && !claimText.includes(key);
    });
    if (untracked.length > 2) fail(g, `${untracked.length} sentence(s) with figures are not in the claim ledger.`);
    gates.push(g);
  }

  // ---------------------------------------------------------------- 3 originality
  {
    const g = gate('originality', 'Not a rewrite of what already ranks');
    if (corpus.some((c) => c.title.toLowerCase() === (draft.title || '').toLowerCase())) fail(g, 'Title already exists on the site.');
    if (corpus.some((c) => c.description === draft.description)) fail(g, 'Description already exists on the site.');
    if (corpus.some((c) => c.slug === draft.slug)) fail(g, 'Slug already exists on the site.');
    const mine = shingles(body);
    let worst = { slug: '', score: 0 };
    for (const c of corpus) {
      const score = overlap(mine, shingles(c.body));
      if (score > worst.score) worst = { slug: c.slug, score };
    }
    if (worst.score > MAX_SHINGLE_OVERLAP) {
      fail(g, `Text overlap with "${worst.slug}" is ${(worst.score * 100).toFixed(1)}% (limit ${MAX_SHINGLE_OVERLAP * 100}%).`);
    } else if (worst.score > 0.06) {
      warn(g, `Closest existing article overlaps ${(worst.score * 100).toFixed(1)}% — review the angle.`);
    }
    if (!draft.originalValue) fail(g, 'No "originalValue" statement: say what this piece adds that the top results do not.');
    gates.push(g);
  }

  // ---------------------------------------------------------------- 4 seo
  {
    const g = gate('seo', 'Technical and on-page SEO');
    const t = draft.title || '';
    const d = draft.description || '';
    if (t.length < 45 || t.length > 65) fail(g, `Title is ${t.length} chars; target 45–65.`);
    if (d.length < 140 || d.length > 160) fail(g, `Meta description is ${d.length} chars; target 140–160.`);
    if (!/^[a-z0-9-]{3,60}$/.test(draft.slug || '')) fail(g, 'Slug must be 3–60 chars of lowercase latin, digits and hyphens.');
    const kw = (seo.primaryKeyword || '').toLowerCase().trim();
    if (!kw) fail(g, 'No primary keyword declared.');
    else {
      if (!t.toLowerCase().includes(kw)) fail(g, `Primary keyword "${kw}" missing from the title.`);
      const first100 = norm(w.slice(0, 100).join(' '));
      if (!first100.includes(norm(kw))) fail(g, `Primary keyword "${kw}" missing from the first 100 words.`);
      const bodyNorm = norm(body);
      const density = (bodyNorm.split(' ').filter((x) => x === norm(kw)).length / Math.max(1, w.length)) * 100;
      if (density > 2.5) fail(g, `Keyword density ${density.toFixed(2)}% is stuffing (limit 2.5%).`);
      if (density < 0.15) warn(g, `Keyword density ${density.toFixed(2)}% is very low; check the topic is actually covered.`);
    }
    const internal = [...body.matchAll(/\]\((\/[^)\s]+)\)/g)].map((m) => m[1]);
    if (internal.length < MIN_INTERNAL_LINKS) fail(g, `${internal.length} internal links; needs ${MIN_INTERNAL_LINKS}+ for topical clustering.`);
    const brokenStyle = internal.filter((u) => !u.startsWith('/articles/') && !u.startsWith('/category/') && !u.startsWith('/tools/') && !u.startsWith('/'));
    if (brokenStyle.length) warn(g, `Unusual internal paths: ${brokenStyle.join(', ')}`);
    gates.push(g);
  }

  // ---------------------------------------------------------------- 5 ai-first
  {
    const g = gate('ai_first', 'Answer-first structure for AI search and featured snippets');
    if (!draft.answerFirst || words(draft.answerFirst).length < 35 || words(draft.answerFirst).length > 75) {
      fail(g, 'answerFirst must be a 35–75 word direct answer (it becomes the opening paragraph and the llms.txt summary).');
    }
    if (!Array.isArray(draft.takeaways) || draft.takeaways.length < 3 || draft.takeaways.length > 5) {
      fail(g, 'takeaways must contain 3–5 short, self-contained statements.');
    }
    if (!Array.isArray(draft.faq) || draft.faq.length < 3) {
      fail(g, 'faq must contain at least 3 question/answer pairs (rendered with FAQPage schema).');
    }
    if (!draft.entities?.length) warn(g, 'No entity list; AI engines lean on explicit entities.');
    if (!seo.llmsSummary) fail(g, 'llmsSummary is required — it is what /llms.txt serves to AI crawlers.');
    gates.push(g);
  }

  // ---------------------------------------------------------------- 6 images
  {
    const g = gate('images', 'Original, accessible artwork');
    const hero = draft.hero;
    if (!hero || !hero.src) fail(g, 'No hero image.');
    else {
      if (!hero.alt || hero.alt.length < 8 || hero.alt.length > 125) fail(g, 'Hero alt text must be 8–125 characters and describe the image.');
      if (!hero.width || !hero.height) fail(g, 'Hero must declare intrinsic width/height (prevents layout shift).');
      // 16:9 (1.78) is the house ratio; 3:2 (1.50) is what most image APIs return.
      if (hero.width / hero.height < 1.4 || hero.width / hero.height > 1.9) {
        fail(g, `Hero aspect ratio is ${(hero.width / hero.height).toFixed(2)}; needs 1.4–1.9 (16:9 or 3:2).`);
      }
    }
    const figures = draft.figures || [];
    if (figures.length > 3) fail(g, `${figures.length} inline figures; more than 3 slows the page for no reading gain.`);
    for (const f of figures) {
      if (!f.alt || f.alt.length < 8) fail(g, `Figure ${f.src} has no usable alt text.`);
    }
    gates.push(g);
  }

  // ---------------------------------------------------------------- 7 honesty
  {
    const g = gate('honesty', 'No fabricated experience or credentials');
    if (!draft.disclosure) fail(g, 'disclosure is required (desk research vs hands-on testing must be stated).');
    const testedClaims = /\b(we tested|we ran|our test|we measured|in our testing)\b/i.test(body);
    if (testedClaims && !draft.tested) {
      fail(g, 'Text claims hands-on testing but the draft is not marked tested — either remove the claim or attach evidence.');
    }
    if (/\b(best|#1|number one)\b/i.test(draft.title || '') && !draft.evidenceForSuperlative) {
      warn(g, 'Superlative in the title without supporting evidence.');
    }
    gates.push(g);
  }

  const blockers = gates.filter((g) => !g.pass && g.severity === 'blocker');
  return { pass: blockers.length === 0, gates, blockers: blockers.length };
}

export function formatReport(result) {
  const lines = [];
  for (const g of result.gates) {
    lines.push(`${g.pass ? 'PASS' : 'FAIL'}  ${g.name.padEnd(12)} ${g.label}`);
    for (const f of g.findings) lines.push(`      · ${f}`);
  }
  return lines.join('\n');
}
