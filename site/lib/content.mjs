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

export function loadArticles() {
  const dir = path.join(dataDir, 'articles');
  const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  const articles = files.map((f) => {
    const raw = JSON.parse(readFileSync(path.join(dir, f), 'utf8'));
    // Fail the build on incomplete content — never ship fake/missing metadata.
    for (const field of ['slug', 'title', 'description', 'category', 'published', 'author']) {
      if (!raw[field]) throw new Error(`Article ${f} missing required field: ${field}`);
    }
    if (!categoryBySlug[raw.category]) throw new Error(`Article ${f} has unknown category: ${raw.category}`);
    const rendered = renderMarkdown(raw.body);
    const readingMinutes = Math.max(1, Math.round(rendered.wordCount / 200));
    return {
      ...raw,
      url: `/articles/${raw.slug}/`,
      html: rendered.html,
      headings: rendered.headings,
      plainText: rendered.plain,
      wordCount: rendered.wordCount,
      readingMinutes,
    };
  });
  // Newest first; stable secondary sort by slug (no fabricated ordering signals).
  return articles.sort((a, b) =>
    (b.published.localeCompare(a.published)) || a.slug.localeCompare(b.slug));
}

export function relatedArticles(all, article, limit = 3) {
  const sameCategory = all.filter((a) => a.slug !== article.slug && a.category === article.category);
  const rest = all.filter((a) => a.slug !== article.slug && a.category !== article.category);
  return [...sameCategory, ...rest].slice(0, limit);
}

export function paginate(items, perPage) {
  const totalPages = Math.max(1, Math.ceil(items.length / perPage));
  const pagesOut = [];
  for (let p = 1; p <= totalPages; p++) {
    pagesOut.push({ page: p, totalPages, items: items.slice((p - 1) * perPage, p * perPage) });
  }
  return pagesOut;
}

export const formatDate = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
  });
