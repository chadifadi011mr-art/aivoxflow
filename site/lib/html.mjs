// HTML layout, shared components, and original SVG cover generation.
// All internal URLs go through p() so a base path (e.g. GitHub Pages
// project sites) can be configured without touching content — no
// temporary domain is ever hardcoded here.
import { config, absoluteUrl } from '../config.mjs';
import { esc } from './markdown.mjs';

export const p = (path) => `${config.basePath}${path}`;

export function iconMark(size = 28) {
  return `<svg class="mark" width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
    <rect width="32" height="32" rx="7.5" fill="#08152F"/>
    <path d="M7 21.5 13 15 19 19 25 10" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="7" cy="21.5" r="2.5" fill="#4C8DFF"/>
    <circle cx="25" cy="10" r="3" fill="#1E6BFF"/>
  </svg>`;
}

// Deterministic, original geometric cover art per category (no stock images,
// no external requests). Decorative by design → empty alt at call sites.
const COVER_PATTERNS = {
  'ai-tools': (w, h) => `<path d="M${w * 0.1} ${h * 0.72} L${w * 0.32} ${h * 0.5} L${w * 0.5} ${h * 0.6} L${w * 0.72} ${h * 0.34} L${w * 0.9} ${h * 0.42}" />`,
  'tutorials': (w, h) => `<path d="M${w * 0.12} ${h * 0.28} H${w * 0.55} M${w * 0.12} ${h * 0.5} H${w * 0.78} M${w * 0.12} ${h * 0.72} H${w * 0.42}" />`,
  'software-web': (w, h) => `<rect x="${w * 0.12}" y="${h * 0.2}" width="${w * 0.3}" height="${h * 0.42}" rx="${w * 0.02}"/><rect x="${w * 0.54}" y="${h * 0.42}" width="${w * 0.3}" height="${h * 0.42}" rx="${w * 0.02}"/>`,
  'automation-agents': (w, h) => `<circle cx="${w * 0.16}" cy="${h * 0.62}" r="${w * 0.022}"/><circle cx="${w * 0.5}" cy="${h * 0.3}" r="${w * 0.022}"/><circle cx="${w * 0.84}" cy="${h * 0.58}" r="${w * 0.022}"/><path d="M${w * 0.16} ${h * 0.62} L${w * 0.5} ${h * 0.3} L${w * 0.84} ${h * 0.58}" fill="none"/>`,
  'ai-news': (w, h) => `<path d="M${w * 0.12} ${h * 0.55} q ${w * 0.08} ${-h * 0.3} ${w * 0.16} 0 t ${w * 0.16} 0 t ${w * 0.16} 0 t ${w * 0.16} 0" fill="none"/>`,
  'comparisons': (w, h) => `<path d="M${w * 0.32} ${h * 0.18} V${h * 0.78} M${w * 0.68} ${h * 0.18} V${h * 0.78}" />`,
};

export function coverSvg(categorySlug, width = 640) {
  const height = Math.round(width * 0.53);
  const pattern = COVER_PATTERNS[categorySlug] || COVER_PATTERNS['ai-tools'];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-hidden="true" focusable="false">
  <rect width="100%" height="100%" fill="#08152F"/>
  <g stroke="#4C8DFF" stroke-width="${Math.max(3, width * 0.008)}" fill="#1E6BFF" stroke-linecap="round" stroke-linejoin="round" opacity="0.9">${pattern(width, height)}</g>
  <g transform="translate(${width * 0.045}, ${height - width * 0.045 - 32}) scale(1)">
    <rect width="32" height="32" rx="7.5" fill="#FFFFFF"/>
    <path d="M7 21.5 13 15 19 19 25 10" fill="none" stroke="#08152F" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="7" cy="21.5" r="2.5" fill="#0B57D0"/>
    <circle cx="25" cy="10" r="3" fill="#1E6BFF"/>
  </g>
</svg>`;
}

const NAV = [
  { href: '/articles/', label: 'Articles' },
  { href: '/tools/', label: 'AI Tools Index' },
  { href: '/search/', label: 'Search' },
  { href: '/about/', label: 'About' },
];

const FOOTER_LINKS = [
  ['/articles/', 'All articles'], ['/tools/', 'AI tools index'],
  ['/about/', 'About AIVOXFLOW'], ['/contact/', 'Contact'],
  ['/editorial-policy/', 'Editorial policy'], ['/corrections/', 'Corrections'],
  ['/privacy/', 'Privacy'], ['/affiliate-disclosure/', 'Affiliate disclosure'],
  ['/terms/', 'Terms'],
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
  const links = FOOTER_LINKS.map(([href, label]) => `<li><a href="${p(href)}">${label}</a></li>`).join('');
  return `<footer class="site-footer">
  <div class="wrap footer-inner">
    <div class="footer-brand">
      <a class="brand" href="${p('/')}">${iconMark(26)}<span class="brand-text">AIVO<span class="brand-x">X</span>FLOW</span></a>
      <p class="footer-tag">${esc(config.tagline)} ${esc(config.slogan)}</p>
    </div>
    <nav aria-label="Footer"><ul class="footer-links">${links}</ul></nav>
  </div>
  <div class="wrap footer-meta">
    <p>&copy; 2026 AIVOXFLOW. Editorial content &mdash; ${esc(config.author)}.</p>
  </div>
</footer>`;
}

function jsonLdScript(blocks) {
  if (!blocks.length) return '';
  const json = JSON.stringify(blocks).replace(/</g, '\\u003c');
  return `\n  <script type="application/ld+json">${json}</script>`;
}

export function layout({ title, description, currentPath, body, jsonLd = [], ogType = 'website', ogImage = '' }) {
  const fullTitle = currentPath === '/' ? `${config.name} — ${config.tagline}` : `${title} — ${config.name}`;
  const canonical = config.siteUrl ? `\n  <link rel="canonical" href="${absoluteUrl(currentPath)}">` : '';
  const ogUrl = config.siteUrl ? `\n  <meta property="og:url" content="${absoluteUrl(currentPath)}">` : '';
  const ogImg = ogImage ? `\n  <meta property="og:image" content="${absoluteUrl(ogImage)}">` : '';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(fullTitle)}</title>
  <meta name="description" content="${esc(description)}">
  <meta name="author" content="${esc(config.author)}">${canonical}
  <meta property="og:site_name" content="${esc(config.name)}">
  <meta property="og:type" content="${ogType}">
  <meta property="og:title" content="${esc(fullTitle)}">
  <meta property="og:description" content="${esc(description)}">${ogUrl}${ogImg}
  <meta name="twitter:card" content="summary">
  <meta name="theme-color" content="#08152F">
  <link rel="icon" href="${p('/assets/favicon.svg')}" type="image/svg+xml">
  <link rel="apple-touch-icon" href="${p('/assets/icons/apple-touch-icon-180.png')}">
  <link rel="manifest" href="${p('/assets/site.webmanifest')}">
  <link rel="stylesheet" href="${p('/assets/css/site.css')}">${jsonLdScript(jsonLd)}
</head>
<body>
${header(currentPath)}
<main id="main">
${body}
</main>
${footer()}
<script src="${p('/assets/js/site.js')}" defer></script>
</body>
</html>`;
}

export function articleCard(a, { headingLevel = 'h3' } = {}) {
  const cat = a.categoryName;
  return `<article class="card">
  <a class="card-cover" href="${p(a.url)}" tabindex="-1" aria-hidden="true">
    <img src="${p(`/assets/covers/${a.category}.svg`)}" alt="" width="640" height="339" loading="lazy" decoding="async">
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
