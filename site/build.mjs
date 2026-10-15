// AIVOXFLOW static site builder — zero dependencies.
// Usage:  node site/build.mjs
// Env:    AIVOXFLOW_SITE_URL   (public URL; when set → canonical/OG/sitemap/robots)
//         AIVOXFLOW_BASE_PATH  (optional sub-path, e.g. /my-repo)
import { mkdirSync, rmSync, writeFileSync, readFileSync, cpSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { config, absoluteUrl } from './config.mjs';
import { layout, p, articleCard, breadcrumb, pagination, coverSvg, iconMark } from './lib/html.mjs';
import { esc, renderMarkdown } from './lib/markdown.mjs';
import {
  loadArticles, categories, categoryBySlug, toolsData, pages,
  relatedArticles, paginate, formatDate,
} from './lib/content.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(root, '..');
const dist = path.join(repo, 'dist');

// ---------------------------------------------------------------- utilities
// maxRetries guards against transient Windows locks (AV/indexer); a process
// whose CWD sits inside dist/ will still block this — stop it first.
rmSync(dist, { recursive: true, force: true, maxRetries: 3, retryDelay: 150 });
const writePage = (route, html) => {
  const file = route.endsWith('.html')
    ? path.join(dist, route)
    : path.join(dist, route, 'index.html');
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, html, 'utf8');
  return route;
};
const routes = [];
const emit = (route, html) => { routes.push(route.endsWith('.html') ? route : `${route}/`); writePage(route, html); };

// ---------------------------------------------------------------- assets
mkdirSync(path.join(dist, 'assets', 'css'), { recursive: true });
mkdirSync(path.join(dist, 'assets', 'js'), { recursive: true });
mkdirSync(path.join(dist, 'assets', 'covers'), { recursive: true });
mkdirSync(path.join(dist, 'assets', 'icons'), { recursive: true });

const tokens = readFileSync(path.join(repo, 'brand', 'tokens.css'), 'utf8');
const siteCss = readFileSync(path.join(root, 'styles', 'site.css'), 'utf8');
writeFileSync(path.join(dist, 'assets', 'css', 'site.css'), `${tokens}\n/* ==== AIVOXFLOW site styles ==== */\n${siteCss}`, 'utf8');
cpSync(path.join(root, 'scripts', 'site.js'), path.join(dist, 'assets', 'js', 'site.js'));
cpSync(path.join(repo, 'brand', 'favicon.svg'), path.join(dist, 'assets', 'favicon.svg'));
cpSync(path.join(repo, 'brand', 'site.webmanifest'), path.join(dist, 'assets', 'site.webmanifest'));
for (const f of readdirSync(path.join(repo, 'brand', 'icons'))) {
  cpSync(path.join(repo, 'brand', 'icons', f), path.join(dist, 'assets', 'icons', f));
}
for (const c of categories) {
  writeFileSync(path.join(dist, 'assets', 'covers', `${c.slug}.svg`), coverSvg(c.slug), 'utf8');
}
const shareCard = path.join(root, 'assets-src', 'share-card.png');
if (existsSync(shareCard)) cpSync(shareCard, path.join(dist, 'assets', 'share-card.png'));
const ogImage = existsSync(shareCard) ? '/assets/share-card.png' : '';

// ---------------------------------------------------------------- content
const articles = loadArticles();
for (const a of articles) {
  a.categoryName = categoryBySlug[a.category].name;
  a.dateLabel = formatDate(a.published);
}
const newest = articles[0];

const breadcrumbsLd = (items) => ({
  '@context': 'https://schema.org', '@type': 'BreadcrumbList',
  itemListElement: items.map((it, i) => ({
    '@type': 'ListItem', position: i + 1, name: it.label,
    item: config.siteUrl ? absoluteUrl(it.href) : undefined,
  })).filter((x) => x.item),
});
const orgLd = {
  '@context': 'https://schema.org', '@type': 'Organization',
  name: config.name, url: config.siteUrl || undefined, slogan: config.tagline,
};

// ---------------------------------------------------------------- home
emit('/', layout({
  title: `${config.name} — ${config.tagline}`,
  description: `${config.tagline} ${config.slogan} Practical AI tools, tutorials, automation guides, and verified AI news.`,
  currentPath: '/',
  ogImage,
  jsonLd: [
    { '@context': 'https://schema.org', '@type': 'WebSite', name: config.name, url: config.siteUrl || undefined,
      description: config.tagline, potentialAction: config.siteUrl ? {
        '@type': 'SearchAction', target: `${absoluteUrl('/search/')}?q={search_term_string}`, 'query-input': 'required name=search_term_string',
      } : undefined },
    orgLd,
  ],
  body: `
<section class="hero">
  <div class="wrap">
    <h1>${esc(config.tagline)}</h1>
    <p class="hero-copy">${esc(config.heroCopy)}</p>
    <form class="hero-search" action="${p('/search/')}" method="get" role="search">
      <label for="hero-q">Search AIVOXFLOW</label>
      <div class="search-row">
        <input id="hero-q" name="q" type="search" placeholder="e.g. choose an AI writing tool" autocomplete="off">
        <button type="submit" class="btn">Search</button>
      </div>
    </form>
  </div>
</section>

<section class="wrap section" aria-labelledby="featured-h">
  <div class="section-head"><h2 id="featured-h">Featured</h2></div>
  <div class="grid">${articles.filter((a) => a.featured).map((a) => articleCard(a)).join('')}</div>
</section>

<section class="wrap section" aria-labelledby="latest-h">
  <div class="section-head"><h2 id="latest-h">Latest articles</h2>
    <a class="section-more" href="${p('/articles/') }">All articles →</a></div>
  <div class="grid">${articles.filter((a) => !a.featured).slice(0, 3).map((a) => articleCard(a)).join('')}</div>
</section>

<section class="section band" aria-labelledby="topics-h">
  <div class="wrap">
    <div class="section-head"><h2 id="topics-h">Browse by topic</h2></div>
    <ul class="topic-grid">${categories.map((c) => `
      <li><a class="topic" href="${p(`/category/${c.slug}/`)}">
        <span class="topic-name">${esc(c.name)}</span>
        <span class="topic-desc">${esc(c.description)}</span>
      </a></li>`).join('')}</ul>
  </div>
</section>

<section class="wrap section" aria-labelledby="tools-h">
  <div class="section-head"><h2 id="tools-h">Practical AI tool picks</h2>
    <a class="section-more" href="${p('/tools/') }">Full tools index →</a></div>
  <p class="section-note">Every entry links to the official source with the date we verified it. No affiliate links.</p>
  <ul class="tool-list">${toolsData.tools.filter((t) => t.verification.status === 'verified').map((t) => `
    <li class="tool">
      <div class="tool-head"><h3>${esc(t.name)}</h3><span class="badge badge-ok">Free tier verified ${esc(t.verification.checkedOn)}</span></div>
      <p>${esc(t.bestFor)}</p>
      <p class="tool-meta"><a class="ext" href="${esc(t.url)}" rel="noopener noreferrer external">${esc(t.vendor)} — official site</a></p>
    </li>`).join('')}</ul>
</section>`,
}));

// ---------------------------------------------------------------- articles list + pagination
const articlePages = paginate(articles, config.articlesPerPage);
articlePages.forEach((pg, idx) => {
  const route = idx === 0 ? '/articles/' : `/articles/page/${pg.page}/`;
  const crumbs = [{ label: 'Home', href: '/' }, { label: 'Articles' }];
  emit(route, layout({
    title: idx === 0 ? 'Articles' : `Articles — page ${pg.page}`,
    description: `All AIVOXFLOW articles on AI tools, tutorials, software, automation, AI news, and comparisons. Page ${pg.page} of ${pg.totalPages}.`,
    currentPath: route,
    ogType: 'website',
    ogImage,
    jsonLd: [breadcrumbsLd(crumbs)],
    body: `
${breadcrumb(crumbs)}
<section class="wrap section page-head">
  <h1>Articles</h1>
  <p class="page-desc">Practical, source-first writing about AI tools, tutorials, software, automation, AI news, and comparisons. Page ${pg.page} of ${pg.totalPages}.</p>
</section>
<section class="wrap section">
  <div class="grid">${pg.items.map((a) => articleCard(a)).join('')}</div>
  ${pagination({ page: pg.page, totalPages: pg.totalPages, basePath: '/articles/' })}
</section>`,
  }));
});

// ---------------------------------------------------------------- article pages
for (const a of articles) {
  const cat = categoryBySlug[a.category];
  const crumbs = [
    { label: 'Home', href: '/' },
    { label: cat.name, href: `/category/${cat.slug}/` },
    { label: a.title },
  ];
  const related = relatedArticles(articles, a, 3);
  const toc = a.headings.filter((h) => h.level === 2);
  emit(a.url, layout({
    title: a.title,
    description: a.description,
    currentPath: a.url,
    ogType: 'article',
    ogImage,
    jsonLd: [
      {
        '@context': 'https://schema.org', '@type': 'Article',
        headline: a.title, description: a.description,
        datePublished: a.published,
        author: { '@type': 'Organization', name: a.author },
        publisher: orgLd,
        mainEntityOfPage: config.siteUrl ? absoluteUrl(a.url) : undefined,
        articleSection: a.categoryName,
      },
      breadcrumbsLd(crumbs),
    ],
    body: `
${breadcrumb(crumbs)}
<article class="wrap article">
  <header class="article-head">
    <p class="card-kicker"><a href="${p(`/category/${cat.slug}/`)}">${esc(cat.name)}</a></p>
    <h1>${esc(a.title)}</h1>
    <p class="article-dek">${esc(a.description)}</p>
    <p class="card-meta">By ${esc(a.author)} · <time datetime="${a.published}">Published ${esc(a.dateLabel)}</time> · ${a.readingMinutes} min read · ${a.wordCount.toLocaleString('en-US')} words</p>
  </header>
  ${a.disclosure ? `<aside class="callout" aria-label="Disclosure"><strong>Disclosure:</strong> ${esc(a.disclosure)}</aside>` : ''}
  ${toc.length >= 3 ? `<nav class="toc" aria-label="Table of contents">
    <details open><summary>On this page</summary>
      <ul>${toc.map((h) => `<li><a href="#${h.id}">${esc(h.text)}</a></li>`).join('')}</ul>
    </details></nav>` : ''}
  <div class="prose">${a.html}</div>
</article>
<section class="wrap section related" aria-labelledby="related-h">
  <div class="section-head"><h2 id="related-h">Keep reading</h2></div>
  <div class="grid">${related.map((r) => articleCard(r)).join('')}</div>
</section>`,
  }));
}

// ---------------------------------------------------------------- category pages
for (const c of categories) {
  const list = articles.filter((a) => a.category === c.slug);
  const crumbs = [{ label: 'Home', href: '/' }, { label: c.name }];
  emit(`/category/${c.slug}/`, layout({
    title: c.name,
    description: c.description,
    currentPath: `/category/${c.slug}/`,
    ogImage,
    jsonLd: [breadcrumbsLd(crumbs)],
    body: `
${breadcrumb(crumbs)}
<section class="wrap section page-head">
  <h1>${esc(c.name)}</h1>
  <p class="page-desc">${esc(c.description)}</p>
</section>
<section class="wrap section">
  ${list.length ? `<div class="grid">${list.map((a) => articleCard(a)).join('')}</div>`
    : `<div class="empty"><p><strong>No articles in this category yet.</strong></p>
       <p>New categories are published only when there is real, reviewed content for them. Browse <a href="${p('/articles/') }">all articles</a> instead.</p></div>`}
</section>`,
  }));
}

// ---------------------------------------------------------------- tools index
emit('/tools/', layout({
  title: 'AI Tools Index',
  description: 'Practical AI tool picks with dated, official-source verification notes — and honest gaps where verification was not possible.',
  currentPath: '/tools/',
  ogImage,
  jsonLd: [orgLd],
  body: `
<section class="wrap section page-head">
  <h1>AI tools index</h1>
  <p class="page-desc">A short, honest index of AI tools worth starting with. Each entry shows <strong>when</strong> we checked it and <strong>against which official page</strong>. We link straight to the vendor — no affiliate parameters, ever. See our <a href="${p('/affiliate-disclosure/')}">affiliate disclosure</a>.</p>
</section>
<section class="wrap section">
  <ul class="tool-list">${toolsData.tools.map((t) => `
    <li class="tool">
      <div class="tool-head"><h2>${esc(t.name)}</h2>
        ${t.verification.status === 'verified'
          ? `<span class="badge badge-ok">Verified ${esc(t.verification.checkedOn)}</span>`
          : `<span class="badge badge-warn">Verification partial — check the official site</span>`}</div>
      <p>${esc(t.bestFor)}</p>
      <p class="tool-meta">Free tier: ${t.freeTier === true ? 'yes (per official page)' : t.freeTier === false ? 'no' : 'not confirmed in our check'} ·
        <a class="ext" href="${esc(t.url)}" rel="noopener noreferrer external">Official site</a> ·
        <a class="ext" href="${esc(t.verification.source)}" rel="noopener noreferrer external">Verification source</a></p>
      <p class="tool-note">${esc(t.verification.note)}</p>
    </li>`).join('')}</ul>
</section>`,
}));

// ---------------------------------------------------------------- search page
emit('/search/', layout({
  title: 'Search',
  description: 'Search AIVOXFLOW articles — runs entirely in your browser; your terms are never sent anywhere.',
  currentPath: '/search/',
  body: `
<section class="wrap section page-head">
  <h1>Search</h1>
  <p class="page-desc">This search runs entirely in your browser against a small index this site publishes. <strong>Your search terms are not sent anywhere</strong> — see the <a href="${p('/privacy/')}">privacy policy</a>.</p>
</section>
<section class="wrap section">
  <form id="search-form" role="search" data-index-url="${p('/assets/search-index.json')}">
    <label for="search-q">Search articles</label>
    <div class="search-row">
      <input id="search-q" name="q" type="search" autocomplete="off" placeholder="e.g. automation">
      <button type="submit" class="btn">Search</button>
    </div>
  </form>
  <p id="search-status" class="section-note" role="status" aria-live="polite"></p>
  <ul id="search-results" class="search-results"></ul>
  <noscript>
    <div class="empty"><p><strong>Search needs JavaScript.</strong></p>
    <p>That is the only place it is used. You can also <a href="${p('/articles/')}">browse all articles</a> or <a href="${p('/tools/')}">the tools index</a>.</p></div>
  </noscript>
</section>`,
}));

// ---------------------------------------------------------------- static pages
for (const pg of pages) {
  const r = renderMarkdown(pg.body);
  emit(`/${pg.slug}/`, layout({
    title: pg.title,
    description: pg.description,
    currentPath: `/${pg.slug}/`,
    ogImage,
    body: `
<section class="wrap section page-head">
  <h1>${esc(pg.title)}</h1>
  <p class="page-desc">${esc(pg.description)}</p>
</section>
<section class="wrap section">
  <div class="prose prose-narrow">${r.html}</div>
</section>`,
  }));
}

// ---------------------------------------------------------------- 404
emit('404.html', layout({
  title: 'Page not found',
  description: 'The page you requested does not exist on AIVOXFLOW.',
  currentPath: '/404.html',
  body: `
<section class="wrap section page-head">
  <h1>404 — page not found</h1>
  <p class="page-desc">That page does not exist (or moved). Nothing is broken except this link.</p>
</section>
<section class="wrap section">
  <ul class="empty-links">
    <li><a href="${p('/')}">Back to the homepage</a></li>
    <li><a href="${p('/articles/')}">Browse all articles</a></li>
    <li><a href="${p('/search/')}">Search AIVOXFLOW</a></li>
    <li><a href="${p('/tools/')}">AI tools index</a></li>
  </ul>
</section>`,
}));

// ---------------------------------------------------------------- search index
writeFileSync(path.join(dist, 'assets', 'search-index.json'), JSON.stringify(
  articles.map((a) => ({
    t: a.title, u: p(a.url), d: a.description, c: a.categoryName,
    dt: a.dateLabel, x: a.plainText.slice(0, 1500),
  })), null, 0), 'utf8');

// ---------------------------------------------------------------- SEO files
if (config.siteUrl) {
  const lastmod = (r) => r.startsWith('/articles/') && !r.endsWith('articles/')
    ? (articles.find((a) => a.url === r)?.published) || config.buildTime.slice(0, 10)
    : config.buildTime.slice(0, 10);
  const urls = routes.filter((r) => !r.endsWith('404.html')).map((r) =>
    `  <url><loc>${absoluteUrl(r)}</loc><lastmod>${lastmod(r)}</lastmod></url>`).join('\n');
  writeFileSync(path.join(dist, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`, 'utf8');
  writeFileSync(path.join(dist, 'robots.txt'),
    `User-agent: *\nAllow: /\n\nSitemap: ${absoluteUrl('/sitemap.xml')}\n`, 'utf8');
} else {
  console.log('NOTE: AIVOXFLOW_SITE_URL not set → canonical URLs, sitemap.xml and robots.txt intentionally omitted.');
}

console.log(`Build complete: ${routes.length} routes → dist/`);
