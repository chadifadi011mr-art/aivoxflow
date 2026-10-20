// HTML layout, shared components, and original SVG cover generation.
// All internal URLs go through p() so a base path (e.g. GitHub Pages
// project sites) can be configured without touching content — no
// temporary domain is ever hardcoded here.
import { config, absoluteUrl } from '../config.mjs';
import { esc } from './markdown.mjs';
import { assets } from './assets.mjs';

export const p = (path) => `${config.basePath}${path}`;
const abs = (path) => (config.siteUrl ? absoluteUrl(path) : p(path));

export function iconMark(size = 28) {
  return `<svg class="mark" width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
    <rect width="32" height="32" rx="7.5" fill="#08152F"/>
    <path d="M7 21.5 13 15 19 19 25 10" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="7" cy="21.5" r="2.5" fill="#4C8DFF"/>
    <circle cx="25" cy="10" r="3" fill="#1E6BFF"/>
  </svg>`;
}

// Deterministic, original geometric cover art per category (no stock images,
// no external requests). Decorative by design → empty alt, aria-hidden img.
// v2 (Phase 1.5): no corner badge (it read as a broken-image glyph), inset
// extents, offset shadow copy for depth, seeded rotation/scale per category.
const COVER_PATTERNS = {
  'ai-tools': (w, h) => `<path d="M${w * 0.1} ${h * 0.72} L${w * 0.32} ${h * 0.5} L${w * 0.5} ${h * 0.6} L${w * 0.72} ${h * 0.34} L${w * 0.9} ${h * 0.42}" />`,
  'tutorials': (w, h) => `<rect x="${w * 0.1}" y="${h * 0.58}" width="${w * 0.22}" height="${h * 0.26}" rx="${w * 0.03}"/><rect x="${w * 0.39}" y="${h * 0.4}" width="${w * 0.22}" height="${h * 0.44}" rx="${w * 0.03}"/><rect x="${w * 0.68}" y="${h * 0.2}" width="${w * 0.22}" height="${h * 0.64}" rx="${w * 0.03}"/>`,
  'software-web': (w, h) => `<rect x="${w * 0.12}" y="${h * 0.2}" width="${w * 0.3}" height="${h * 0.42}" rx="${w * 0.02}"/><rect x="${w * 0.54}" y="${h * 0.42}" width="${w * 0.3}" height="${h * 0.42}" rx="${w * 0.02}"/>`,
  'automation-agents': (w, h) => `<circle cx="${w * 0.16}" cy="${h * 0.62}" r="${w * 0.022}"/><circle cx="${w * 0.5}" cy="${h * 0.3}" r="${w * 0.022}"/><circle cx="${w * 0.84}" cy="${h * 0.58}" r="${w * 0.022}"/><path d="M${w * 0.16} ${h * 0.62} L${w * 0.5} ${h * 0.3} L${w * 0.84} ${h * 0.58}" fill="none"/>`,
  'ai-news': (w, h) => `<path d="M${w * 0.12} ${h * 0.55} q ${w * 0.08} ${-h * 0.3} ${w * 0.16} 0 t ${w * 0.16} 0 t ${w * 0.16} 0 t ${w * 0.16} 0" fill="none"/>`,
  'comparisons': (w, h) => `<path d="M${w * 0.14} ${h * 0.26} L${w * 0.43} ${h * 0.5} L${w * 0.14} ${h * 0.74} M${w * 0.86} ${h * 0.26} L${w * 0.57} ${h * 0.5} L${w * 0.86} ${h * 0.74}" fill="none"/><circle cx="${w * 0.5}" cy="${h * 0.5}" r="${w * 0.02}" stroke="none"/>`,
};

const coverHash = (s) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };

export function coverSvg(categorySlug, width = 640) {
  const height = Math.round(width * 0.53);
  const pattern = COVER_PATTERNS[categorySlug] || COVER_PATTERNS['ai-tools'];
  // Inset the pattern to ~85% of the frame with ~8% padding, then apply a
  // small seeded rotation (-4°…4°) and scale (0.92…1.08) from the slug so
  // repeated-category covers are never pixel-identical.
  const hash = coverHash(categorySlug);
  const rot = (hash % 9) - 4;
  const scl = (0.92 + ((hash >>> 4) % 17) / 100).toFixed(3);
  const art = pattern(width, height);
  const layer = (opacity) => `<g stroke="#4C8DFF" stroke-width="${Math.max(3, width * 0.008)}" fill="#1E6BFF" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}"><g transform="translate(${(width * 0.075).toFixed(1)}, ${(height * 0.08).toFixed(1)}) scale(0.85)">${art}</g></g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-hidden="true" focusable="false">
  <rect width="100%" height="100%" fill="#08152F"/>
  <g transform="translate(${width / 2} ${height / 2}) rotate(${rot}) scale(${scl}) translate(${-width / 2} ${-height / 2})">
    <g transform="translate(10 10)">${layer(0.22)}</g>
    ${layer(0.9)}
  </g>
</svg>`;
}

const NAV = [
  { href: '/articles/', label: 'Articles' },
  { href: '/tools/', label: 'AI Tools Index' },
  { href: '/search/', label: 'Search' },
  { href: '/about/', label: 'About' },
];

// Footer link groups (pre-deployment pass): same nine links, now in three
// labeled groups so visitors can scan by intent. "About & Standards" is
// written with an entity because labels are inserted into HTML unescaped.
const FOOTER_GROUPS = [
  ['Read', [
    ['/articles/', 'All articles'], ['/tools/', 'AI tools index'],
    ...(config.siteUrl ? [['/feed.xml', 'RSS feed']] : []),
  ]],
  ['About &amp; Standards', [
    ['/about/', 'About AIVOXFLOW'], ['/authors/editorial/', 'Editorial team'],
    ['/contact/', 'Contact'], ['/editorial-policy/', 'Editorial policy'],
    ['/corrections/', 'Corrections'],
  ]],
  ['Legal', [
    ['/privacy/', 'Privacy'], ['/affiliate-disclosure/', 'Affiliate disclosure'],
    ['/terms/', 'Terms'],
  ]],
];

function header(currentPath) {
  const items = NAV.map((n) => {
    const active = currentPath === n.href || (n.href !== '/' && currentPath.startsWith(n.href));
    return `<li><a href="${p(n.href)}"${active ? ' aria-current="page"' : ''}>${n.label}</a></li>`;
  }).join('');
  return `<a class="skip-link" href="#main">Skip to main content</a>
<header class="site-header">
  <div class="wrap header-inner">
    <a class="brand" href="${p('/')}" aria-label="AIVOXFLOW home">
      ${iconMark(30)}<span class="brand-text">AIVO<span class="brand-x">X</span>FLOW</span>
    </a>
    <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav">
      <span class="nav-toggle-icon" aria-hidden="true"></span> Menu
    </button>
    <nav id="site-nav" class="site-nav" aria-label="Main">
      <ul>${items}</ul>
    </nav>
  </div>
</header>`;
}

function footer() {
  const groups = FOOTER_GROUPS.map(([label, links]) => `
    <div class="footer-group">
      <h2 class="footer-group-title">${label}</h2>
      <ul class="footer-links">${links.map(([href, text]) => `<li><a href="${p(href)}">${text}</a></li>`).join('')}</ul>
    </div>`).join('');
  const year = new Date(config.buildTime).getUTCFullYear();
  return `<footer class="site-footer">
  <div class="wrap footer-inner">
    <div class="footer-brand">
      <a class="brand" href="${p('/')}">${iconMark(26)}<span class="brand-text">AIVO<span class="brand-x">X</span>FLOW</span></a>
      <p class="footer-tag">${esc(config.tagline)} ${esc(config.slogan)}</p>
      ${config.siteUrl ? `<p class="footer-feed"><a href="${p('/feed.xml')}">RSS</a> · <a href="${p('/feed.json')}">JSON Feed</a></p>` : ''}
    </div>
    <nav aria-label="Footer"><div class="footer-groups">${groups}
    </div></nav>
  </div>
  <div class="wrap footer-meta">
    <p>&copy; ${year} AIVOXFLOW. Editorial content &mdash; ${esc(config.author)}.</p>
  </div>
</footer>`;
}

function jsonLdScript(blocks) {
  if (!blocks.length) return '';
  const json = JSON.stringify(blocks).replace(/</g, '\\u003c');
  return `\n  <script type="application/ld+json">${json}</script>`;
}

function analyticsTag() {
  if (!config.analytics.script) return '';
  return `\n  <script defer src="${esc(config.analytics.script)}"${
    config.analytics.endpoint ? ` data-endpoint="${esc(config.analytics.endpoint)}"` : ''}></script>`;
}

// hreflang is only emitted when more than one locale is actually published,
// and only for real equivalent translations.
function hreflangTags() {
  if (config.locales.length < 2) return '';
  return config.locales.map((l) =>
    `\n  <link rel="alternate" hreflang="${l.code}" href="${abs(`/${l.code}/`)}">`).join('') +
    `\n  <link rel="alternate" hreflang="x-default" href="${abs('/')}">`;
}

export function layout({
  title, description, currentPath, body, jsonLd = [], ogType = 'website',
  ogImage = '', ogImageAlt = '', ogImageWidth = 1200, ogImageHeight = 630,
  serifPreload = false, noindex = false,
  prevUrl = '', nextUrl = '', article = null,
}) {
  const fullTitle = currentPath === '/' ? `${config.name} — ${config.tagline}` : `${title} — ${config.name}`;
  const canonical = config.siteUrl ? `\n  <link rel="canonical" href="${absoluteUrl(currentPath)}">` : '';
  const ogUrl = config.siteUrl ? `\n  <meta property="og:url" content="${absoluteUrl(currentPath)}">` : '';
  const img = ogImage ? `\n  <meta property="og:image" content="${abs(ogImage)}">
  <meta property="og:image:width" content="${ogImageWidth}">
  <meta property="og:image:height" content="${ogImageHeight}">
  <meta property="og:image:alt" content="${esc(ogImageAlt || fullTitle)}">
  <meta name="twitter:image" content="${abs(ogImage)}">
  <meta name="twitter:image:alt" content="${esc(ogImageAlt || fullTitle)}">` : '';
  const robots = noindex ? `\n  <meta name="robots" content="noindex, follow">` : '';
  const paging = `${prevUrl ? `\n  <link rel="prev" href="${abs(prevUrl)}">` : ''}${
    nextUrl ? `\n  <link rel="next" href="${abs(nextUrl)}">` : ''}`;
  const articleMeta = article ? `
  <meta property="article:published_time" content="${article.published}">
  <meta property="article:modified_time" content="${article.modified}">
  <meta property="article:section" content="${esc(article.categoryName)}">${
    article.tags.map((t) => `\n  <meta property="article:tag" content="${esc(t)}">`).join('')}` : '';

  return `<!doctype html>
<html lang="${esc(config.language)}" dir="ltr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(fullTitle)}</title>
  <meta name="description" content="${esc(description)}">
  <meta name="author" content="${esc(config.author)}">
  <meta name="color-scheme" content="light">${canonical}${robots}${paging}
  <meta property="og:site_name" content="${esc(config.name)}">
  <meta property="og:locale" content="${esc(config.locale)}">
  <meta property="og:type" content="${ogType}">
  <meta property="og:title" content="${esc(fullTitle)}">
  <meta property="og:description" content="${esc(description)}">${ogUrl}${img}${articleMeta}
  <meta name="twitter:card" content="${ogImage ? 'summary_large_image' : 'summary'}">
  <meta name="twitter:title" content="${esc(fullTitle)}">
  <meta name="twitter:description" content="${esc(description)}">
  <meta name="theme-color" content="#08152F">
  <link rel="icon" href="${p('/assets/favicon.svg')}" type="image/svg+xml">
  <link rel="apple-touch-icon" href="${p('/assets/icons/apple-touch-icon-180.png')}">
  <link rel="manifest" href="${p('/assets/site.webmanifest')}">
  ${config.siteUrl ? `<link rel="alternate" type="application/rss+xml" title="AIVOXFLOW" href="${p('/feed.xml')}">
  <link rel="alternate" type="application/feed+json" title="AIVOXFLOW" href="${p('/feed.json')}">` : ''}${hreflangTags()}
  <link rel="preload" href="${p('/assets/fonts/inter-latin-400-normal.woff2')}" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="${p('/assets/fonts/inter-latin-800-normal.woff2')}" as="font" type="font/woff2" crossorigin>${serifPreload ? `\n  <link rel="preload" href="${p('/assets/fonts/source-serif-4-latin-400-normal.woff2')}" as="font" type="font/woff2" crossorigin>` : ''}
  <link rel="stylesheet" href="${p(assets.css)}">${jsonLdScript(jsonLd)}${analyticsTag()}
</head>
<body>
${header(currentPath)}
<main id="main">
${body}
</main>
${footer()}
<script src="${p(assets.js)}" defer></script>
</body>
</html>`;
}

export function articleCard(a, { headingLevel = 'h3', eager = false } = {}) {
  const cat = a.categoryName;
  // Covers are decorative (empty alt, hidden from a11y tree): the adjacent
  // category link and title carry the meaning — explicit editorial decision.
  const load = eager ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"';
  return `<article class="card">
  <a class="card-cover" href="${p(a.url)}" tabindex="-1" aria-hidden="true">
    <img src="${p(`/assets/covers/${a.category}.svg`)}" alt="" width="640" height="339" ${load} decoding="async">
  </a>
  <div class="card-body">
    <p class="card-kicker"><a href="${p(`/category/${a.category}/`)}">${esc(cat)}</a></p>
    <${headingLevel} class="card-title"><a href="${p(a.url)}">${esc(a.title)}</a></${headingLevel}>
    <p class="card-desc">${esc(a.description)}</p>
    <p class="card-meta"><time datetime="${a.published}">${esc(a.dateLabel)}</time> · ${a.readingMinutes} min read</p>
  </div>
</article>`;
}

export function breadcrumb(items) {
  const parts = items.map((it, idx) => {
    const last = idx === items.length - 1;
    const inner = it.href && !last ? `<a href="${p(it.href)}">${esc(it.label)}</a>` : `<span${last ? ' aria-current="page"' : ''}>${esc(it.label)}</span>`;
    return `<li>${inner}</li>`;
  }).join('');
  return `<nav class="breadcrumb" aria-label="Breadcrumb"><ol>${parts}</ol></nav>`;
}

export function pagination({ page, totalPages, basePath }) {
  if (totalPages <= 1) return '';
  const link = (n) => n === 1 ? p(basePath) : p(`${basePath}page/${n}/`);
  const parts = [];
  parts.push(page > 1
    ? `<a class="page-link" href="${link(page - 1)}" rel="prev">← Newer</a>`
    : `<span class="page-link disabled">← Newer</span>`);
  for (let n = 1; n <= totalPages; n++) {
    parts.push(n === page
      ? `<span class="page-link current" aria-current="page">${n}</span>`
      : `<a class="page-link" href="${link(n)}">${n}</a>`);
  }
  parts.push(page < totalPages
    ? `<a class="page-link" href="${link(page + 1)}" rel="next">Older →</a>`
    : `<span class="page-link disabled">Older →</span>`);
  return `<nav class="pagination" aria-label="Pagination">${parts.join('')}</nav>`;
}

// First-party share links: no third-party script, no tracking pixel.
export function shareRow(url, title) {
  const u = encodeURIComponent(abs(url));
  const t = encodeURIComponent(title);
  return `<div class="share" aria-label="Share this article">
  <span class="share-label">Share</span>
  <a class="share-btn" href="https://x.com/intent/tweet?url=${u}&amp;text=${t}" rel="noopener noreferrer external" target="_blank">X</a>
  <a class="share-btn" href="https://www.linkedin.com/sharing/share-offsite/?url=${u}" rel="noopener noreferrer external" target="_blank">LinkedIn</a>
  <button class="share-btn" type="button" data-copy-url="${esc(abs(url))}">Copy link</button>
  <span class="share-status" role="status" aria-live="polite"></span>
</div>`;
}

export function authorBox(author) {
  return `<aside class="author-box" aria-label="About the author">
  <div class="author-mark" aria-hidden="true">${esc(author.name.charAt(0))}</div>
  <div>
    <p class="author-name"><a href="${p(`/authors/${author.slug}/`)}">${esc(author.name)}</a></p>
    <p class="author-bio">${esc(author.bio)}</p>
  </div>
</aside>`;
}
