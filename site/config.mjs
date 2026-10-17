// AIVOXFLOW site configuration.
// RULE: no domain may be hardcoded here. The public site URL comes from the
// AIVOXFLOW_SITE_URL environment variable at build time; when it is absent,
// canonical URLs, OG urls, sitemap and robots are OMITTED (not guessed).
const siteUrl = (process.env.AIVOXFLOW_SITE_URL || '').trim().replace(/\/+$/, '');
if (siteUrl && !/^https?:\/\//.test(siteUrl)) {
  throw new Error('AIVOXFLOW_SITE_URL must start with http:// or https://');
}

// Production guard: a production build without a URL would silently ship
// with no canonicals, sitemap.xml, robots.txt or feeds. Hosts announce
// themselves (Netlify sets NETLIFY=true, Vercel sets VERCEL=1) and CI sets
// AIVOXFLOW_ENVIRONMENT=production explicitly. Local previews set none of
// these, so they keep working with the URL omitted.
const isProductionEnv = /^(1|true)$/i.test((process.env.NETLIFY || '').trim())
  || /^(1|true)$/i.test((process.env.VERCEL || '').trim())
  || /^production$/i.test((process.env.AIVOXFLOW_ENVIRONMENT || '').trim());
if (isProductionEnv && !siteUrl) {
  throw new Error(
    'AIVOXFLOW_SITE_URL is required for a production build. Without it the site '
    + 'would publish with no canonical URLs, sitemap, robots.txt or feeds. Set '
    + 'AIVOXFLOW_SITE_URL=https://<your-domain> in the build environment, or '
    + 'unset the production marker (NETLIFY / VERCEL / AIVOXFLOW_ENVIRONMENT) '
    + 'for a local preview.',
  );
}

const env = (name, fallback = '') => (process.env[name] || fallback).trim();

// Optional sub-path for hosts that serve from /subpath/ (e.g. GitHub project
// pages): AIVOXFLOW_BASE_PATH=/my-repo
const basePath = (() => {
  const raw = env('AIVOXFLOW_BASE_PATH');
  return raw ? `/${raw.replace(/^\/+|\/+$/g, '')}` : '';
})();

export const config = {
  name: 'AIVOXFLOW',
  tagline: 'Intelligence in Motion.',
  slogan: 'Discover AI. Master Tools. Automate More.',
  heroCopy: 'Discover AI tools, learn practical workflows, and make technology work for you.',
  // Drives <html lang>/<html dir> and Intl formatting. Adding a locale here is
  // not enough to publish a translation — see docs/I18N.md.
  language: env('AIVOXFLOW_LANGUAGE', 'en'),
  locale: env('AIVOXFLOW_LOCALE', 'en_US'),
  author: 'AIVOXFLOW Editorial',
  siteUrl, // '' when not configured → SEO absolute features disabled
  basePath,
  buildTime: new Date().toISOString(),
  // Bump when the copy of the static/legal pages changes. Used as <lastmod>
  // for non-article routes so the sitemap never claims "everything changed".
  contentUpdated: '2026-10-17',
  articlesPerPage: 5,
  // Languages actually published. Only `en` exists today; the switcher and
  // hreflang output stay inert until a second locale is added here.
  locales: [
    { code: 'en', label: 'English', dir: 'ltr', default: true },
  ],
  // Optional real channels. Both stay OFF unless configured — the site never
  // publishes an address or form that is not actually monitored.
  contactEmail: env('AIVOXFLOW_CONTACT_EMAIL'),
  newsletterAction: env('AIVOXFLOW_NEWSLETTER_ACTION'),
  features: {
    newsletter: Boolean(env('AIVOXFLOW_NEWSLETTER_ACTION')),
    contactEmail: env('AIVOXFLOW_CONTACT_EMAIL'),
  },
  // Privacy-first measurement. Nothing is injected unless configured; the CSP
  // in _headers is widened only for these origins.
  analytics: {
    script: env('AIVOXFLOW_ANALYTICS_SCRIPT'),
    endpoint: env('AIVOXFLOW_ANALYTICS_ENDPOINT'),
  },
  social: {} // intentionally empty; no fake profiles
};

// Absolute URL for a site-relative path. `basePath` is part of the deployed
// path, so it must be included — otherwise sub-path deployments emit broken
// canonicals, sitemap entries and OG image URLs.
export const absoluteUrl = (path) =>
  config.siteUrl ? config.siteUrl + config.basePath + path : '';
