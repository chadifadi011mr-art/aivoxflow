// QA gate runner and the publisher.
//
// The pipeline never writes into site/data/articles on its own: it stops at
// "scheduled" with a draft in content/drafts/. Promotion is a separate,
// explicit step (--publish), matching AGENTS.md rule 7.
import { writeFileSync, readdirSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { runGates, formatReport, loadCorpus } from '../lib/gates.mjs';
import { note, saveDraft, repo } from '../lib/job.mjs';

// ---------------------------------------------------------------- 07 QA
export async function qaAgent(ctx) {
  const { job, log } = ctx;
  const draft = job.artifacts.draft || {};
  const result = runGates({
    draft,
    research: job.artifacts.research,
    factcheck: job.artifacts.factcheck,
    seo: job.artifacts.seo,
    corpus: loadCorpus(),
  });
  job.gates = Object.fromEntries(result.gates.map((g) => [g.name, { pass: g.pass, findings: g.findings }]));
  note(job, 'qa:done', result.pass ? 'all gates passed' : `${result.blockers} blocking gate(s)`);
  log(formatReport(result).split('\n').map((l) => `  ${l}`).join('\n'));
  return { pass: result.pass, result };
}

// ---------------------------------------------------------------- 08 publish
export function buildArticle(job) {
  const d = job.artifacts.draft;
  const seo = job.artifacts.seo || {};
  // A scheduled article is dated for its slot, not for the moment it was
  // generated. The site build hides future-dated articles until that day.
  const published = job.scheduledFor ? job.scheduledFor.slice(0, 10) : new Date().toISOString().slice(0, 10);
  return {
    slug: d.slug,
    title: d.title,
    seoTitle: d.seoTitle && d.seoTitle !== d.title ? d.seoTitle : undefined,
    description: d.description,
    category: job.category,
    published,
    author: 'AIVOXFLOW Editorial',
    authorSlug: 'editorial',
    tags: (seo.secondaryKeywords || []).slice(0, 4).map((t) => String(t).toLowerCase()),
    featured: false,
    disclosure: d.disclosure,
    tested: Boolean(d.tested),
    hero: d.hero,
    takeaways: d.takeaways,
    faq: d.faq,
    body: d.body,
  };
}

export function saveScheduled(job) {
  const article = buildArticle(job);
  const file = saveDraft(article.slug, article);
  job.artifacts.articlePath = file;
  note(job, 'scheduled', file);
  return file;
}

export function promote(job) {
  const article = buildArticle(job);
  const dir = path.join(repo, 'site', 'data', 'articles');
  mkdirSync(dir, { recursive: true });
  const existing = readdirSync(dir).filter((f) => f.endsWith('.json'));
  if (existing.some((f) => f === `${article.slug}.json`)) {
    throw new Error(`Article already exists: site/data/articles/${article.slug}.json`);
  }
  const n = String(existing.length + 1).padStart(2, '0');
  const file = path.join(dir, `${n}-${article.slug}.json`);
  // Drop undefined keys so the JSON stays clean.
  const clean = Object.fromEntries(Object.entries(article).filter(([, v]) => v !== undefined));
  writeFileSync(file, `${JSON.stringify(clean, null, 2)}\n`, 'utf8');
  note(job, 'published', file);

  // Artwork is authored under content/drafts/assets/<slug>/ and only enters the
  // site's asset tree when the article is actually promoted.
  const srcDir = path.join(repo, 'content', 'drafts', 'assets', article.slug);
  if (existsSync(srcDir)) {
    const destDir = path.join(repo, 'site', 'assets-src', 'articles', article.slug);
    cpSync(srcDir, destDir, { recursive: true });
    note(job, 'assets:published', destDir);
  }
  return file;
}
