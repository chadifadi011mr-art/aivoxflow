// AIVOXFLOW static site builder — zero dependencies.
// Usage:  node site/build.mjs
// Env:    AIVOXFLOW_SITE_URL        public URL → canonical/OG/sitemap/robots/feeds
//         AIVOXFLOW_BASE_PATH       optional sub-path, e.g. /my-repo
//         AIVOXFLOW_CONTACT_EMAIL   enables the real contact channel
//         AIVOXFLOW_NEWSLETTER_ACTION  enables the newsletter form (POST target)
//         AIVOXFLOW_ANALYTICS_SCRIPT / _ENDPOINT  opt-in measurement
//
// The build writes into dist.tmp/ and swaps it into place only when every
// page has been generated, so a failed build never leaves a half-published
// site behind.
import {
  mkdirSync, rmSync, writeFileSync, readFileSync, cpSync, existsSync,
  readdirSync, renameSync, statSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { config, absoluteUrl } from './config.mjs';
import {
  layout, p, articleCard, breadcrumb, pagination, coverSvg,
  shareRow, authorBox,
} from './lib/html.mjs';
import { esc, renderMarkdown, setImageResolver } from './lib/markdown.mjs';
import { imageSize } from './lib/imagesize.mjs';
import { assets } from './lib/assets.mjs';
import {
  loadArticles, categories, categoryBySlug, toolsData, pages, authors, authorBySlug,
  relatedArticles, paginate, formatDate, hiddenArticles,
} from './lib/content.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(root, '..');
const dist = path.join(repo, 'dist');
const tmp = path.join(repo, 'dist.tmp');
const old = path.join(repo, 'dist.old');

// ---------------------------------------------------------------- utilities
rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
mkdirSync(tmp, { recursive: true });

const routes = [];
const routeDates = new Map();

// Normalise exactly once: every route keeps a single leading slash and a
// single trailing slash. Joining these with the site URL must never produce
// "//" — that was the sitemap bug this rewrite fixes.
const normalizeRoute = (route) => {
  if (route.endsWith('.html') || route.endsWith('.xml') || route.endsWith('.json') || route.endsWith('.txt')) return route;
  const withLead = route.startsWith('/') ? route : `/${route}`;
  return withLead.endsWith('/') ? withLead : `${withLead}/`;
};

const writePage = (route, html) => {
  const file = route.endsWith('.html')
    ? path.join(tmp, route)
    : path.join(tmp, route, 'index.html');
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, html, 'utf8');
};

const emit = (route, html, date) => {
  const r = normalizeRoute(route);
  routes.push(r);
  if (date) routeDates.set(r, date);
  writePage(r, html);
};

const maxDate = (dates) => dates.filter(Boolean).sort().pop();

// ---------------------------------------------------------------- assets
const sha = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 10);

// Conservative, quote-aware CSS minifier: drops comments and redundant
// whitespace but never touches strings or calc() operators.
function minifyCss(css) {
  let out = '';
  let i = 0;
  let quote = null;
  let pendingSpace = false;
  const DROP_AROUND = new Set(['{', '}', ';', ',', '>', ':']);
  while (i < css.length) {
    const c = css[i];
    if (quote) {
      out += c;
      if (c === '\\') { out += css[i + 1] || ''; i += 2; continue; }
      if (c === quote) quote = null;
      i++;
      continue;
    }
    if (c === '"' || c === "'") { quote = c; out += c; i++; continue; }
    if (c === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      i = end === -1 ? css.length : end + 2;
      continue;
    }
    if (/\s/.test(c)) { pendingSpace = true; i++; continue; }
    if (pendingSpace) {
      const prev = out[out.length - 1] || '';
      if (!DROP_AROUND.has(prev) && !DROP_AROUND.has(c)) out += ' ';
      pendingSpace = false;
    }
    out += c;
    i++;
  }
  return out.trim();
}

mkdirSync(path.join(tmp, 'assets', 'css'), { recursive: true });
mkdirSync(path.join(tmp, 'assets', 'js'), { recursive: true });
mkdirSync(path.join(tmp, 'assets', 'covers'), { recursive: true });
mkdirSync(path.join(tmp, 'assets', 'icons'), { recursive: true });
mkdirSync(path.join(tmp, 'assets', 'fonts'), { recursive: true });
mkdirSync(path.join(tmp, 'assets', 'og'), { recursive: true });

const tokens = readFileSync(path.join(repo, 'brand', 'tokens.css'), 'utf8');
const siteCss = readFileSync(path.join(root, 'styles', 'site.css'), 'utf8');
const cssOut = minifyCss(`${tokens}\n${siteCss}`);
const cssName = `site.${sha(cssOut)}.css`;
writeFileSync(path.join(tmp, 'assets', 'css', cssName), cssOut, 'utf8');
assets.css = `/assets/css/${cssName}`;

const jsSrc = readFileSync(path.join(root, 'scripts', 'site.js'), 'utf8');
const jsName = `site.${sha(jsSrc)}.js`;
writeFileSync(path.join(tmp, 'assets', 'js', jsName), jsSrc, 'utf8');
assets.js = `/assets/js/${jsName}`;

cpSync(path.join(repo, 'brand', 'favicon.svg'), path.join(tmp, 'assets', 'favicon.svg'));
cpSync(path.join(repo, 'brand', 'site.webmanifest'), path.join(tmp, 'assets', 'site.webmanifest'));
for (const f of readdirSync(path.join(repo, 'brand', 'icons'))) {
  cpSync(path.join(repo, 'brand', 'icons', f), path.join(tmp, 'assets', 'icons', f));
}
// Self-hosted OFL fonts (WOFF2 + license texts, which must ship with them).
for (const f of readdirSync(path.join(root, 'assets', 'fonts'))) {
  cpSync(path.join(root, 'assets', 'fonts', f), path.join(tmp, 'assets', 'fonts', f));
}
// Search-engine ownership files (google<token>.html, bing-site-verification…):
// site operators drop them in site/ and they must reach the site root verbatim.
// Only files matching the well-known verification patterns are copied, so a
// stray HTML file in site/ can never end up publicly served by accident.
for (const f of readdirSync(root)) {
  if (/^(google[0-9a-f]+|google-site-verification|BingSiteAuthForm)\.html$/i.test(f)) {
    cpSync(path.join(root, f), path.join(tmp, f));
    console.log(`Verification file copied: ${f}`);
  }
}
for (const c of categories) {
  writeFileSync(path.join(tmp, 'assets', 'covers', `${c.slug}.svg`), coverSvg(c.slug), 'utf8');
}

// Social cards are pre-rendered PNGs (1200×630) committed under
// site/assets-src/og — see site/og/generate.mjs. SVG is not accepted by most
// social platforms, so the build only links them when the PNG exists.
const ogDir = path.join(root, 'assets-src', 'og');
const hasOg = existsSync(ogDir);
if (hasOg) {
  for (const f of readdirSync(ogDir)) {
    if (f.endsWith('.png')) cpSync(path.join(ogDir, f), path.join(tmp, 'assets', 'og', f));
  }
}
const ogFor = (name) => (hasOg && existsSync(path.join(ogDir, `${name}.png`)) ? `/assets/og/${name}.png` : '');
const ogDefault = ogFor('default');

// Per-article artwork (hero + inline figures) lives beside the OG cards, in
// site/assets-src/articles/<slug>/, and is copied into the build output.
const articleAssetsDir = path.join(root, 'assets-src', 'articles');
if (existsSync(articleAssetsDir)) {
  cpSync(articleAssetsDir, path.join(tmp, 'assets', 'articles'), { recursive: true });
}

// Image dimensions for Markdown images: look in the build output first, then
// in the source tree, so authors never have to hand-write width/height.
// Wired BEFORE loadArticles(): that call renders every article body
// (site/lib/content.mjs → renderMarkdown), so setting the resolver afterwards
// would leave every Markdown <img> (inline figures) without width/height and
// cause avoidable layout shift.
setImageResolver((src) => {
  const clean = src.replace(/^\//, '').split('?')[0];
  const candidates = [
    path.join(tmp, clean),
    // /assets/articles/<slug>/x.png is authored in site/assets-src/articles/<slug>/x.png
    clean.startsWith('assets/articles/')
      ? path.join(repo, 'site', 'assets-src', clean.replace(/^assets\//, ''))
      : null,
    path.join(repo, 'site', clean),
    path.join(repo, clean),
  ].filter(Boolean);
  for (const c of candidates) {
    if (existsSync(c) && statSync(c).isFile()) {
      const size = imageSize(c);
      if (size && size.width > 0 && size.height > 0) return { src, ...size };
    }
  }
  return null;
});

// ---------------------------------------------------------------- content
const articles = loadArticles();
for (const a of articles) {
  a.categoryName = categoryBySlug[a.category].name;
  a.dateLabel = formatDate(a.published, 'en-US');
  a.updatedLabel = a.updated ? formatDate(a.updated, 'en-US') : '';
}
const newestDate = maxDate(articles.map((a) => a.modified)) || config.contentUpdated;

// Tool-card spec rows (Phase 1.5 final review): label/value pairs so the
// free-tier answer scans in one glance; state is carried by text, not color.
const freeTierLabel = (v) => v === true ? 'Yes — per official page' : v === false ? 'No' : 'Not confirmed in our check';
const freeTierClass = (v) => v === true ? 'spec-yes' : v === false ? 'spec-no' : 'spec-unknown';

const breadcrumbsLd = (items) => (config.siteUrl ? {
  '@context': 'https://schema.org', '@type': 'BreadcrumbList',
  itemListElement: items.map((it, i) => ({
    '@type': 'ListItem', position: i + 1, name: it.label,
    // The current page may omit `item`; an empty URL would be invalid.
    ...(it.href ? { item: absoluteUrl(it.href) } : {}),
  })),
} : null);

const orgLd = {
  '@context': 'https://schema.org', '@type': 'Organization',
  name: config.name, url: config.siteUrl || undefined, slogan: config.tagline,
  logo: {
    '@type': 'ImageObject',
    url: config.siteUrl ? absoluteUrl('/assets/icons/icon-512.png') : '/assets/icons/icon-512.png',
    width: 512, height: 512,
  },
};
// Publisher node for nesting inside Article (no repeated @context).
const publisherLd = {
  '@type': 'Organization', name: config.name,
  url: config.siteUrl || undefined, logo: orgLd.logo,
};

const ld = (...blocks) => blocks.filter(Boolean);

// ---------------------------------------------------------------- home
emit('/', layout({
  title: `${config.name} — ${config.tagline}`,
  description: `${config.tagline} ${config.slogan} Practical AI tools, tutorials, automation guides, and verified AI news.`,
  currentPath: '/',
  ogImage: ogDefault,
  jsonLd: ld(
    { '@context': 'https://schema.org', '@type': 'WebSite', name: config.name, url: config.siteUrl || undefined,
      description: config.tagline, inLanguage: config.language, potentialAction: config.siteUrl ? {
        '@type': 'SearchAction', target: `${absoluteUrl('/search/')}?q={search_term_string}`, 'query-input': 'required name=search_term_string',
      } : undefined },
    orgLd,
  ),
  body: `
<section class="hero">
  <div class="wrap hero-inner">
    <div class="hero-text">
      <h1>${esc(config.tagline)}</h1>
      <p class="hero-copy">${esc(config.heroCopy)}</p>
    </div>
    <div class="hero-aside">
      <svg class="hero-motif" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
        <g fill="none" stroke="#4C8DFF" stroke-width="3" stroke-linecap="round">
          <path d="M-20 230 C 80 230, 130 150, 230 150 S 370 70, 470 70"/>
          <path d="M-20 272 C 100 272, 150 192, 250 192 S 390 112, 490 112" opacity="0.65"/>
          <path d="M-20 188 C 60 188, 110 108, 210 108 S 350 28, 450 28" opacity="0.4"/>
        </g>
        <circle cx="230" cy="150" r="6" fill="#4C8DFF"/>
        <circle cx="250" cy="192" r="4.5" fill="#4C8DFF" opacity="0.65"/>
      </svg>
      <form class="hero-search" action="${p('/search/')}" method="get" role="search">
        <label for="hero-q">Search AIVOXFLOW</label>
        <div class="search-row">
          <input id="hero-q" name="q" type="search" placeholder="e.g. choose an AI writing tool" autocomplete="off">
          <button type="submit" class="btn">Search</button>
        </div>
      </form>
    </div>
  </div>
</section>

<section class="wrap section" aria-labelledby="featured-h">
  <div class="section-head"><h2 id="featured-h">Featured</h2></div>
  <div class="grid grid-featured">${articles.filter((a) => a.featured).map((a, i) => articleCard(a, { eager: i === 0 })).join('')}</div>
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
      <div class="tool-head"><span class="tool-mono" aria-hidden="true">${esc(t.name[0])}</span><h3>${esc(t.name)}</h3><span class="badge badge-ok">Verified ${esc(t.verification.checkedOn)}</span></div>
      <p class="tool-desc">${esc(t.bestFor)}</p>
      <dl class="tool-spec">
        <dt>Free tier</dt><dd class="${freeTierClass(t.freeTier)}">${freeTierLabel(t.freeTier)}</dd>
      </dl>
      <p class="tool-meta"><a class="ext" href="${esc(t.url)}" rel="noopener noreferrer external">${esc(t.vendor)} — official site</a></p>
    </li>`).join('')}</ul>
</section>`,
}), newestDate);

// ---------------------------------------------------------------- articles list + pagination
const articlePages = paginate(articles, config.articlesPerPage);
articlePages.forEach((pg, idx) => {
  const route = idx === 0 ? '/articles/' : `/articles/page/${pg.page}/`;
  const crumbs = [{ label: 'Home', href: '/' }, { label: 'Articles' }];
  const prevUrl = pg.page > 1 ? (pg.page === 2 ? '/articles/' : `/articles/page/${pg.page - 1}/`) : '';
  const nextUrl = pg.page < pg.totalPages ? `/articles/page/${pg.page + 1}/` : '';
  emit(route, layout({
    title: idx === 0 ? 'Articles' : `Articles — page ${pg.page}`,
    description: idx === 0
      ? 'All AIVOXFLOW articles on AI tools, tutorials, software, automation, AI news, and comparisons.'
      : `Page ${pg.page} of the AIVOXFLOW article archive — more practical AI guides on tools, tutorials, software, automation, AI news, and comparisons.`,
    currentPath: route,
    ogType: 'website',
    ogImage: ogDefault,
    prevUrl,
    nextUrl,
    jsonLd: ld(breadcrumbsLd(crumbs)),
    body: `
<div class="wrap">${breadcrumb(crumbs)}</div>
<section class="wrap section page-head">
  <h1>Articles</h1>
  <p class="page-desc">Practical, source-first writing about AI tools, tutorials, software, automation, AI news, and comparisons.</p>
</section>
<section class="wrap section">
  <div class="grid">${pg.items.map((a, i) => articleCard(a, { headingLevel: 'h2', eager: i === 0 })).join('')}</div>
  <p class="section-note page-note">Showing ${pg.items.length} of ${articles.length} articles · Page ${pg.page} of ${pg.totalPages}</p>
  ${pagination({ page: pg.page, totalPages: pg.totalPages, basePath: '/articles/' })}
</section>`,
  }), newestDate);
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
  // Social image: a dedicated branded card when one exists, otherwise the
  // article's own hero (social platforms accept the JPG), else the site default.
  // Autonomous publishing cannot render cards (no browser in the CI runner), so
  // pipeline-generated articles fall back to their hero — and the og dimensions
  // reported in the meta tags must describe whichever image is actually used.
  const ogCard = ogFor(a.slug);
  const useHeroOg = !ogCard && Boolean(a.hero);
  const articleOg = ogCard || (useHeroOg ? a.hero.src : ogDefault);
  const ogW = useHeroOg ? (a.hero.width || 1600) : 1200;
  const ogH = useHeroOg ? (a.hero.height || 900) : 630;
  const updatedLine = a.updated
    ? ` · <time datetime="${a.updated}">Updated ${esc(a.updatedLabel)}</time>`
    : '';
  const heroBlock = a.hero ? `<figure class="article-hero">
    <img src="${p(a.hero.src)}" alt="${esc(a.hero.alt)}" width="${a.hero.width || 1600}" height="${a.hero.height || 900}" loading="eager" fetchpriority="high" decoding="async">
  </figure>` : '';
  const takeawaysBlock = a.takeaways.length ? `<aside class="takeaways" aria-labelledby="takeaways-h">
    <h2 id="takeaways-h">Key takeaways</h2>
    <ul>${a.takeaways.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
  </aside>` : '';
  const faqBlock = a.faq.length ? `<section class="article-faq" aria-labelledby="faq-h">
    <h2 id="faq-h">Frequently asked questions</h2>
    ${a.faq.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('')}
  </section>` : '';
  const faqLd = a.faq.length ? {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: a.faq.map((f) => ({
      '@type': 'Question', name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  } : null;
  emit(a.url, layout({
    title: a.seoTitle || a.title,
    description: a.description,
    currentPath: a.url,
    ogType: 'article',
    ogImage: articleOg,
    ogImageWidth: ogW,
    ogImageHeight: ogH,
    ogImageAlt: a.title,
    serifPreload: true,
    prevUrl: '',
    nextUrl: '',
    article: a,
    jsonLd: ld(
      {
        '@context': 'https://schema.org', '@type': 'Article',
        headline: a.title, description: a.description,
        datePublished: a.published,
        dateModified: a.modified,
        inLanguage: config.language,
        image: articleOg ? [config.siteUrl ? absoluteUrl(articleOg) : articleOg] : undefined,
        author: {
          '@type': a.authorData.type, name: a.author,
          url: config.siteUrl ? absoluteUrl(`/authors/${a.authorSlug}/`) : undefined,
        },
        publisher: publisherLd,
        mainEntityOfPage: config.siteUrl ? { '@type': 'WebPage', '@id': absoluteUrl(a.url) } : undefined,
        articleSection: a.categoryName,
        keywords: a.tags.length ? a.tags.join(', ') : undefined,
      },
      breadcrumbsLd(crumbs),
      faqLd,
    ),
    body: `
<div class="wrap wrap-narrow">${breadcrumb(crumbs)}</div>
<article class="wrap article">
  ${heroBlock}
  <header class="article-head${a.hero ? ' article-head--cover' : ''}">
    <p class="card-kicker"><a href="${p(`/category/${cat.slug}/`)}">${esc(cat.name)}</a></p>
    <h1>${esc(a.title)}</h1>
    <p class="article-dek">${esc(a.description)}</p>
    <p class="card-meta">By <a href="${p(`/authors/${a.authorSlug}/`)}">${esc(a.author)}</a> · <time datetime="${a.published}">Published ${esc(a.dateLabel)}</time>${updatedLine} · ${a.readingMinutes} min read · ${a.wordCount.toLocaleString('en-US')} words</p>
  </header>
  ${takeawaysBlock}
  ${a.disclosure ? `<aside class="callout" aria-label="Disclosure"><strong>Disclosure:</strong> ${esc(a.disclosure)}</aside>` : ''}
  ${toc.length >= 3 ? `<nav class="toc" aria-label="Table of contents">
    <details><summary>On this page</summary>
      <ul>${toc.map((h) => `<li><a href="#${h.id}">${esc(h.text)}</a></li>`).join('')}</ul>
    </details></nav>` : ''}
  <div class="prose">${a.html}</div>
  ${faqBlock}
  ${a.tags.length ? `<ul class="tags" aria-label="Topics">${a.tags.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
  ${shareRow(a.url, a.title)}
  ${authorBox(a.authorData)}
</article>
<section class="wrap wrap-narrow section related" aria-labelledby="related-h">
  <div class="section-head"><h2 id="related-h">Keep reading</h2></div>
  <div class="grid">${related.map((r) => articleCard(r)).join('')}</div>
</section>`,
  }), a.modified);
}

// ---------------------------------------------------------------- category pages
for (const c of categories) {
  const list = articles.filter((a) => a.category === c.slug);
  const crumbs = [{ label: 'Home', href: '/' }, { label: c.name }];
  emit(`/category/${c.slug}/`, layout({
    title: c.name,
    description: c.description,
    currentPath: `/category/${c.slug}/`,
    ogImage: ogDefault,
    jsonLd: ld(breadcrumbsLd(crumbs), list.length ? {
      '@context': 'https://schema.org', '@type': 'CollectionPage',
      name: c.name, description: c.description, inLanguage: config.language,
    } : null),
    body: `
<div class="wrap">${breadcrumb(crumbs)}</div>
<section class="wrap section page-head">
  <h1>${esc(c.name)}</h1>
  <p class="page-desc">${esc(c.description)}</p>
</section>
<section class="wrap section">
  ${list.length ? `<div class="grid">${list.map((a, i) => articleCard(a, { headingLevel: 'h2', eager: i === 0 })).join('')}</div>`
    : `<div class="empty"><p><strong>No articles in this category yet.</strong></p>
       <p>New categories are published only when there is real, reviewed content for them. Browse <a href="${p('/articles/') }">all articles</a> instead.</p></div>`}
</section>`,
  }), maxDate(list.map((a) => a.modified)) || config.contentUpdated);
}

// ---------------------------------------------------------------- tools index
const toolCrumbs = [{ label: 'Home', href: '/' }, { label: 'AI Tools Index' }];
const toolsChecked = maxDate(toolsData.tools.map((t) => t.verification.checkedOn)) || config.contentUpdated;
emit('/tools/', layout({
  title: 'AI Tools Index',
  description: 'Practical AI tool picks with dated, official-source verification notes — and honest gaps where verification was not possible.',
  currentPath: '/tools/',
  ogImage: ogFor('tools') || ogDefault,
  jsonLd: ld(orgLd, breadcrumbsLd(toolCrumbs), {
    '@context': 'https://schema.org', '@type': 'ItemList',
    name: 'AI tools index',
    itemListElement: toolsData.tools.map((t, i) => ({
      '@type': 'ListItem', position: i + 1, name: t.name, url: t.url,
    })),
  }),
  body: `
<div class="wrap">${breadcrumb(toolCrumbs)}</div>
<section class="wrap section page-head">
  <h1>AI tools index</h1>
  <p class="page-desc">A short, honest index of AI tools worth starting with. Each entry shows <strong>when</strong> we checked it, and against which official page. We link straight to the vendor — no affiliate parameters, ever. See our <a href="${p('/affiliate-disclosure/')}">affiliate disclosure</a>.</p>
</section>
<section class="wrap section" aria-labelledby="compare-h">
  <div class="section-head"><h2 id="compare-h">At a glance</h2></div>
  <div class="table-wrap">
    <table class="compare">
      <caption class="visually-hidden">AI tools compared by vendor, best use, free tier and verification date</caption>
      <thead><tr><th scope="col">Tool</th><th scope="col">Vendor</th><th scope="col">Best for</th><th scope="col">Free tier</th><th scope="col">Verified</th></tr></thead>
      <tbody>${toolsData.tools.map((t) => `<tr>
        <th scope="row"><a class="ext" href="${esc(t.url)}" rel="noopener noreferrer external">${esc(t.name)}</a></th>
        <td>${esc(t.vendor)}</td>
        <td>${esc(t.bestFor.split(':')[0])}</td>
        <td class="${freeTierClass(t.freeTier)}">${freeTierLabel(t.freeTier)}</td>
        <td>${esc(t.verification.checkedOn)}${t.verification.status === 'verified' ? '' : ' <span class="badge badge-warn">partial</span>'}</td>
      </tr>`).join('')}</tbody>
    </table>
  </div>
  <p class="section-note">“Not confirmed” is a result, not a gap in the table: it means we could not verify the claim from an official page on the date shown.</p>
</section>
<section class="wrap section" aria-labelledby="detail-h">
  <div class="section-head"><h2 id="detail-h">Verification detail</h2></div>
  <ul class="tool-list">${toolsData.tools.map((t) => `
    <li class="tool">
      <div class="tool-head"><span class="tool-mono" aria-hidden="true">${esc(t.name[0])}</span><h3>${esc(t.name)}</h3>
        ${t.verification.status === 'verified'
          ? `<span class="badge badge-ok">Verified ${esc(t.verification.checkedOn)}</span>`
          : `<span class="badge badge-warn">Verification partial — check the official site</span>`}</div>
      <p class="tool-desc">${esc(t.bestFor)}</p>
      <dl class="tool-spec">
        <dt>Free tier</dt><dd class="${freeTierClass(t.freeTier)}">${freeTierLabel(t.freeTier)}</dd>
        <dt>Sources</dt><dd><a class="ext" href="${esc(t.url)}" rel="noopener noreferrer external">Official site</a><span class="meta-sep" aria-hidden="true"> · </span><a class="ext" href="${esc(t.verification.source)}" rel="noopener noreferrer external">Verification source</a></dd>
      </dl>
      <p class="tool-note"><span class="note-label">Verification note</span>${esc(t.verification.note)}</p>
    </li>`).join('')}</ul>
</section>`,
}), toolsChecked);

// ---------------------------------------------------------------- author pages
for (const a of authors) {
  const list = articles.filter((x) => x.authorSlug === a.slug);
  const crumbs = [{ label: 'Home', href: '/' }, { label: 'Authors' }, { label: a.name }];
  emit(`/authors/${a.slug}/`, layout({
    title: a.name,
    description: a.bio.slice(0, 155),
    currentPath: `/authors/${a.slug}/`,
    ogImage: ogDefault,
    jsonLd: ld({
      '@context': 'https://schema.org', '@type': a.type,
      name: a.name, description: a.bio,
      url: config.siteUrl ? absoluteUrl(`/authors/${a.slug}/`) : undefined,
      knowsAbout: a.knowsAbout,
      sameAs: a.sameAs.length ? a.sameAs : undefined,
    }, breadcrumbsLd(crumbs)),
    body: `
<div class="wrap">${breadcrumb(crumbs)}</div>
<section class="wrap section page-head">
  <h1>${esc(a.name)}</h1>
  <p class="page-desc">${esc(a.role)}</p>
</section>
<section class="wrap section">
  <div class="prose prose-narrow"><p>${esc(a.bio)}</p></div>
</section>
<section class="wrap section">
  <div class="section-head"><h2>Articles by ${esc(a.name)}</h2></div>
  <div class="grid">${list.map((x) => articleCard(x, { headingLevel: 'h3' })).join('')}</div>
</section>`,
  }), maxDate(list.map((x) => x.modified)) || config.contentUpdated);
}

// ---------------------------------------------------------------- search page
emit('/search/', layout({
  title: 'Search',
  description: 'Search AIVOXFLOW articles — runs entirely in your browser; your terms are never sent anywhere.',
  currentPath: '/search/',
  noindex: true,
  body: `
<section class="wrap section page-head">
  <h1>Search</h1>
  <p class="page-desc">This search runs entirely in your browser against a small index this site publishes. <strong>Your search terms are not sent anywhere</strong> — see the <a href="${p('/privacy/')}">privacy policy</a>.</p>
</section>
<section class="wrap section">
  <form id="search-form" role="search" data-index-url="${p('/assets/search-index.json')}">
    <label for="search-q">Search articles</label>
    <div class="search-row">
      <div class="combo">
        <input id="search-q" name="q" type="search" autocomplete="off" placeholder="e.g. automation"
          role="combobox" aria-expanded="false" aria-controls="search-results" aria-autocomplete="list">
      </div>
      <label class="visually-hidden" for="search-filter">Filter by topic</label>
      <select id="search-filter" name="topic">
        <option value="">All topics</option>
        ${categories.map((c) => `<option value="${esc(c.slug)}">${esc(c.name)}</option>`).join('')}
      </select>
      <button type="submit" class="btn">Search</button>
    </div>
  </form>
  <p id="search-status" class="section-note" role="status" aria-live="polite"></p>
  <ul id="search-results" class="search-results" role="listbox" aria-label="Search results"></ul>
  <noscript>
    <div class="empty"><p><strong>Search needs JavaScript.</strong></p>
    <p>That is the only place it is used. You can also <a href="${p('/articles/')}">browse all articles</a> or <a href="${p('/tools/')}">the tools index</a>.</p></div>
  </noscript>
</section>`,
}, config.contentUpdated));

// ---------------------------------------------------------------- newsletter
const newsletterBody = config.newsletterAction ? `
<section class="wrap section">
  <form class="newsletter" action="${esc(config.newsletterAction)}" method="post">
    <label for="nl-email">Email address</label>
    <div class="search-row">
      <input id="nl-email" name="email" type="email" required autocomplete="email" placeholder="you@example.com">
      <button type="submit" class="btn">Subscribe</button>
    </div>
    <p class="section-note">One email per new article. Unsubscribe in one click. We never sell or share addresses — see the <a href="${p('/privacy/')}">privacy policy</a>.</p>
  </form>
</section>` : `
<section class="wrap section">
  <div class="empty">
    <p><strong>The email newsletter is not open yet.</strong></p>
    <p>We will only publish a form once there is a monitored list behind it. Until then, ${config.siteUrl
      ? `<a href="${p('/feed.xml')}">follow the RSS feed</a> — it carries every article with no tracking and no email address.`
      : 'the RSS feed will carry every article with no tracking and no email address.'}</p>
  </div>
</section>`;
emit('/newsletter/', layout({
  title: 'Newsletter',
  description: 'AIVOXFLOW newsletter — one email per new article, or follow the RSS feed.',
  currentPath: '/newsletter/',
  body: `
<section class="wrap section page-head">
  <h1>Newsletter</h1>
  <p class="page-desc">The slowest possible inbox: one email when a new article is published, and nothing else.</p>
</section>
${newsletterBody}`,
}, config.contentUpdated));

// ---------------------------------------------------------------- static pages
const contactBlock = config.contactEmail
  ? `<div class="contact-card">
      <p class="contact-label">Email</p>
      <p><a class="contact-mail" href="mailto:${esc(config.contactEmail)}">${esc(config.contactEmail)}</a></p>
      <p class="section-note">We read every message and aim to reply within three working days.</p>
    </div>`
  : `<div class="contact-card contact-card--pending">
      <p><strong>No public contact channel yet.</strong></p>
      <p class="section-note">We will not publish an address that is not actively monitored. Factual corrections are handled through the <a href="${p('/corrections/')}">corrections page</a>.</p>
    </div>`;

for (const pg of pages) {
  const r = renderMarkdown(pg.body);
  const body = pg.slug === 'contact'
    ? r.html.replace(/<p>\[\[CONTACT_CHANNEL\]\]<\/p>/, contactBlock)
    : r.html;
  emit(`/${pg.slug}/`, layout({
    title: pg.title,
    description: pg.description,
    currentPath: `/${pg.slug}/`,
    ogImage: ogDefault,
    serifPreload: true,
    jsonLd: ld(breadcrumbsLd([{ label: 'Home', href: '/' }, { label: pg.title }])),
    body: `
<section class="wrap section page-head">
  <h1>${esc(pg.title)}</h1>
  <p class="page-desc">${esc(pg.description)}</p>
</section>
<section class="wrap section">
  <div class="prose prose-narrow">${body}</div>
</section>`,
  }), pg.updated || config.contentUpdated);
}

// ---------------------------------------------------------------- 404
emit('404.html', layout({
  title: 'Page not found',
  description: 'The page you requested does not exist on AIVOXFLOW.',
  currentPath: '/404.html',
  noindex: true,
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
}, config.contentUpdated));

// ---------------------------------------------------------------- search index
writeFileSync(path.join(tmp, 'assets', 'search-index.json'), JSON.stringify(
  articles.map((a) => ({
    t: a.title, u: p(a.url), d: a.description, c: a.categoryName,
    dt: a.dateLabel, g: a.category, tags: a.tags, x: a.plainText.slice(0, 6000),
  })), null, 0), 'utf8');

// ---------------------------------------------------------------- AI discovery
// /llms.txt is the emerging convention for telling AI crawlers what the site is
// and which pages are worth ingesting. /llms-full.txt carries the text itself,
// so an answer engine can quote accurately instead of guessing from markup.
const absOrRel = (pathname) => (config.siteUrl ? absoluteUrl(pathname) : p(pathname));
const llmsIndex = [
  `# ${config.name}`,
  '',
  `> ${config.tagline} ${config.slogan}`,
  '',
  `${config.name} is an independent publication about AI tools, tutorials, software, automation and verified AI news. Every article states its sources, the date facts were checked, and whether it is desk research or hands-on testing. Content is written for practitioners making a decision, not for search engines.`,
  '',
  '## Articles',
  ...articles.map((a) => `- [${a.title}](${absOrRel(a.url)}): ${a.description}`),
  '',
  '## Tools',
  `- [AI tools index](${absOrRel('/tools/')}): ${toolsData.tools.length} tools with dated, official-source verification notes.`,
  '',
  '## Standards',
  `- [Editorial policy](${absOrRel('/editorial-policy/')}): how claims are sourced and corrected.`,
  `- [About](${absOrRel('/about/')}): who publishes this and why.`,
  '',
  `Last built: ${config.buildTime.slice(0, 10)}`,
  '',
].join('\n');
writeFileSync(path.join(tmp, 'llms.txt'), llmsIndex, 'utf8');

const llmsFull = [
  `# ${config.name} — full text`,
  '',
  `> ${config.tagline}`,
  '',
  'This file contains the complete text of every published article so AI systems can quote it accurately. Each article states its sources and verification date.',
  '',
  ...articles.map((a) => [
    '---',
    '',
    `# ${a.title}`,
    '',
    `${a.description}`,
    '',
    `URL: ${absOrRel(a.url)}`,
    `Published: ${a.published}${a.updated ? ` · Updated: ${a.updated}` : ''}`,
    `Section: ${a.categoryName}`,
    `Byline: ${a.author}`,
    '',
    a.answerFirst || '',
    '',
    a.plainText,
    '',
  ].join('\n')),
].join('\n');
writeFileSync(path.join(tmp, 'llms-full.txt'), llmsFull, 'utf8');

// ---------------------------------------------------------------- SEO files
const indexable = routes.filter((r) => !r.endsWith('404.html') && r !== '/search/');

if (config.siteUrl) {
  const urls = indexable.map((r) => {
    const lastmod = routeDates.get(r) || config.contentUpdated;
    return `  <url><loc>${absoluteUrl(r)}</loc><lastmod>${lastmod}</lastmod></url>`;
  }).join('\n');
  writeFileSync(path.join(tmp, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`, 'utf8');

  writeFileSync(path.join(tmp, 'robots.txt'),
    `User-agent: *\nAllow: /\n\nSitemap: ${absoluteUrl('/sitemap.xml')}\n`, 'utf8');

  // ---- RSS 2.0 + JSON Feed (absolute URLs only, hence siteUrl-gated)
  const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  const rfc822 = (iso) => new Date(`${iso}T09:00:00Z`).toUTCString();
  const items = articles.map((a) => `    <item>
      <title>${xml(a.title)}</title>
      <link>${absoluteUrl(a.url)}</link>
      <guid isPermaLink="true">${absoluteUrl(a.url)}</guid>
      <pubDate>${rfc822(a.published)}</pubDate>
      <category>${xml(a.categoryName)}</category>
      <description>${xml(a.description)}</description>
    </item>`).join('\n');
  writeFileSync(path.join(tmp, 'feed.xml'),
`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${xml(config.name)}</title>
    <link>${absoluteUrl('/')}</link>
    <description>${xml(`${config.tagline} ${config.slogan}`)}</description>
    <language>${config.language}</language>
    <lastBuildDate>${new Date(config.buildTime).toUTCString()}</lastBuildDate>
    <atom:link href="${absoluteUrl('/feed.xml')}" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>
`, 'utf8');

  writeFileSync(path.join(tmp, 'feed.json'), JSON.stringify({
    version: 'https://jsonfeed.org/version/1.1',
    title: config.name,
    home_page_url: absoluteUrl('/'),
    feed_url: absoluteUrl('/feed.json'),
    description: `${config.tagline} ${config.slogan}`,
    language: config.language,
    items: articles.map((a) => ({
      id: absoluteUrl(a.url),
      url: absoluteUrl(a.url),
      title: a.title,
      summary: a.description,
      date_published: `${a.published}T09:00:00Z`,
      date_modified: `${a.modified}T09:00:00Z`,
      tags: [a.categoryName, ...a.tags],
    })),
  }, null, 2), 'utf8');
} else {
  console.log('NOTE: AIVOXFLOW_SITE_URL not set → canonical URLs, sitemap.xml, robots.txt and feeds intentionally omitted.');
}

// ---------------------------------------------------------------- deploy config
// Security headers are generated here so the CSP can be widened only for the
// analytics origin the operator actually configured.
const analyticsOrigins = [config.analytics.script, config.analytics.endpoint]
  .filter(Boolean)
  .map((u) => { try { return new URL(u).origin; } catch { return ''; } })
  .filter(Boolean);
const scriptSrc = ["'self'", ...analyticsOrigins].join(' ');
const connectSrc = ["'self'", ...analyticsOrigins].join(' ');
const newsletterOrigin = config.newsletterAction
  ? (() => { try { return new URL(config.newsletterAction).origin; } catch { return ''; } })()
  : '';
const csp = [
  "default-src 'self'",
  `script-src ${scriptSrc}`,
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  `connect-src ${connectSrc}`,
  `form-action 'self'${newsletterOrigin ? ` ${newsletterOrigin}` : ''}`,
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  'upgrade-insecure-requests',
].join('; ');

const headerBlock = `/*
  Content-Security-Policy: ${csp}
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: geolocation=(), camera=(), microphone=(), interest-cohort=()
  Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
  Cross-Origin-Opener-Policy: same-origin

/assets/*
  Cache-Control: public, max-age=31536000, immutable

/*.html
  Cache-Control: public, max-age=0, must-revalidate

/search/*
  X-Robots-Tag: noindex, follow

/feed.xml
  Content-Type: application/rss+xml; charset=utf-8
  Cache-Control: public, max-age=1800

/feed.json
  Content-Type: application/feed+json; charset=utf-8
  Cache-Control: public, max-age=1800

/sitemap.xml
  Content-Type: application/xml; charset=utf-8
`;
writeFileSync(path.join(tmp, '_headers'), headerBlock, 'utf8');

// ---------------------------------------------------------------- swap into place
// Atomic-ish publish: the new tree is fully written before the live one is
// touched, and the previous tree is kept until the swap succeeds.
try {
  rmSync(old, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
} catch { /* leftover is harmless */ }
let moved = false;
if (existsSync(dist)) {
  try { renameSync(dist, old); moved = true; } catch (e) {
    throw new Error(`Could not move the live dist/ aside (${e.code || e.message}). ` +
      'Stop any process whose working directory is inside dist/ and rebuild. dist/ was left untouched.');
  }
}
try {
  renameSync(tmp, dist);
} catch (e) {
  if (moved) { try { renameSync(old, dist); } catch { /* manual recovery needed */ } }
  throw new Error(`Publish swap failed (${e.code || e.message}); the previous dist/ was restored.`);
}
try { rmSync(old, { recursive: true, force: true, maxRetries: 3, retryDelay: 150 }); } catch { /* keep as backup */ }

console.log(`Build complete: ${routes.length} routes → dist/ (css ${cssName}, js ${jsName})`);
if (hiddenArticles() > 0) {
  console.log(`Scheduled: ${hiddenArticles()} future-dated article(s) held back until their slot.`);
}
