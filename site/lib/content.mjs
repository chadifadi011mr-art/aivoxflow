// Content loading + derived data for the AIVOXFLOW static site.
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { renderMarkdown } from './markdown.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(here, '..', 'data');
const readJson = (p) => JSON.parse(readFileSync(path.join(dataDir, p), 'utf8'));

export const categories = readJson('categories.json').categories;
export const categoryBySlug = Object.fromEntries(categories.map((c) => [c.slug, c]));

export const toolsData = readJson('tools.json');

export const pages = readJson('pages.json').pages;

export const authors = readJson('authors.json').authors;
export const authorBySlug = Object.fromEntries(authors.map((a) => [a.slug, a]));

const REQUIRED = ['slug', 'title', 'description', 'category', 'published', 'author'];

// Scheduled articles are written ahead of time and dated for their slot. The
// build hides anything dated in the future so a cron rebuild at 06:00 cannot
// leak tomorrow's article. Set AIVOXFLOW_INCLUDE_FUTURE=1 to preview the queue.
let hiddenCount = 0;
export const hiddenArticles = () => hiddenCount;

export function loadArticles() {
  const dir = path.join(dataDir, 'articles');
  const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  const seenSlug = new Map();
  const seenTitle = new Map();
  const seenDescription = new Map();

  const articles = files.map((f) => {
    const raw = JSON.parse(readFileSync(path.join(dir, f), 'utf8'));
    // Fail the build on incomplete content — never ship fake/missing metadata.
    for (const field of REQUIRED) {
      if (!raw[field]) throw new Error(`Article ${f} missing required field: ${field}`);
    }
    if (!categoryBySlug[raw.category]) throw new Error(`Article ${f} has unknown category: ${raw.category}`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw.published)) throw new Error(`Article ${f} has a non-ISO published date`);
    if (raw.updated && !/^\d{4}-\d{2}-\d{2}$/.test(raw.updated)) throw new Error(`Article ${f} has a non-ISO updated date`);

    // Duplicate slugs silently overwrite each other on disk and produce
    // duplicate sitemap entries — treat as a hard build error.
    if (seenSlug.has(raw.slug)) throw new Error(`Duplicate slug "${raw.slug}" in ${f} and ${seenSlug.get(raw.slug)}`);
    seenSlug.set(raw.slug, f);
    if (seenTitle.has(raw.title)) throw new Error(`Duplicate title in ${f} and ${seenTitle.get(raw.title)}`);
    seenTitle.set(raw.title, f);
    if (seenDescription.has(raw.description)) throw new Error(`Duplicate description in ${f} and ${seenDescription.get(raw.description)}`);
    seenDescription.set(raw.description, f);

    const authorSlug = raw.authorSlug || 'editorial';
    const author = authorBySlug[authorSlug];
    if (!author) throw new Error(`Article ${f} references unknown author: ${authorSlug}`);
    if (author.name !== raw.author) throw new Error(`Article ${f} author name does not match authors.json entry "${authorSlug}"`);

    const rendered = renderMarkdown(raw.body);
    const readingMinutes = Math.max(1, Math.round(rendered.wordCount / 200));
    if (raw.hero && (!raw.hero.src || !raw.hero.alt)) {
      throw new Error(`Article ${f} has a hero image without src/alt`);
    }
    return {
      ...raw,
      authorSlug,
      authorData: author,
      url: `/articles/${raw.slug}/`,
      html: rendered.html,
      headings: rendered.headings,
      plainText: rendered.plain,
      wordCount: rendered.wordCount,
      readingMinutes,
      modified: raw.updated || raw.published,
      tags: Array.isArray(raw.tags) ? raw.tags : [],
      takeaways: Array.isArray(raw.takeaways) ? raw.takeaways : [],
      faq: Array.isArray(raw.faq) ? raw.faq : [],
      hero: raw.hero || null,
      answerFirst: raw.answerFirst || '',
    };
  });
  // Newest first; stable secondary sort by slug (no fabricated ordering signals).
  const sorted = articles.sort((a, b) =>
    (b.published.localeCompare(a.published)) || a.slug.localeCompare(b.slug));

  if (process.env.AIVOXFLOW_INCLUDE_FUTURE === '1') { hiddenCount = 0; return sorted; }
  const today = new Date().toISOString().slice(0, 10);
  const visible = sorted.filter((a) => a.published <= today);
  hiddenCount = sorted.length - visible.length;
  return visible;
}

export function relatedArticles(all, article, limit = 3) {
  const sameCategory = all.filter((a) => a.slug !== article.slug && a.category === article.category);
  const sameTag = all.filter((a) => a.slug !== article.slug && a.category !== article.category &&
    a.tags.some((t) => article.tags.includes(t)));
  const rest = all.filter((a) => a.slug !== article.slug && a.category !== article.category &&
    !sameTag.includes(a));
  return [...sameCategory, ...sameTag, ...rest].slice(0, limit);
}

export function paginate(items, perPage) {
  const totalPages = Math.max(1, Math.ceil(items.length / perPage));
  const pagesOut = [];
  for (let p = 1; p <= totalPages; p++) {
    pagesOut.push({ page: p, totalPages, items: items.slice((p - 1) * perPage, p * perPage) });
  }
  return pagesOut;
}

export const formatDate = (iso, locale = 'en-US') =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale, {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
  });
