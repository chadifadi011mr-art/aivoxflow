// AIVOXFLOW site configuration.
// RULE: no domain may be hardcoded here. The public site URL comes from the
// AIVOXFLOW_SITE_URL environment variable at build time; when it is absent,
// canonical URLs, OG urls, sitemap and robots are OMITTED (not guessed).
const siteUrl = (process.env.AIVOXFLOW_SITE_URL || '').trim().replace(/\/+$/, '');
if (siteUrl && !/^https?:\/\//.test(siteUrl)) {
  throw new Error('AIVOXFLOW_SITE_URL must start with http:// or https://');
}

export const config = {
  name: 'AIVOXFLOW',
  tagline: 'Intelligence in Motion.',
  slogan: 'Discover AI. Master Tools. Automate More.',
  heroCopy: 'Discover AI tools, learn practical workflows, and make technology work for you.',
  language: 'en',
  locale: 'en_US',
  author: 'AIVOXFLOW Editorial',
  siteUrl, // '' when not configured → SEO absolute features disabled
  // Optional sub-path for hosts that serve from /subpath/ (e.g. GitHub
  // project pages): AIVOXFLOW_BASE_PATH=/my-repo
  basePath: (() => {
    const raw = (process.env.AIVOXFLOW_BASE_PATH || '').trim();
    return raw ? `/${raw.replace(/^\/+|\/+$/g, '')}` : '';
  })(),
  buildTime: new Date().toISOString(),
  articlesPerPage: 5,
  features: {
    // Hidden until a real, privacy-conscious mechanism exists (Stage-1 rule).
    newsletter: false,
    contactEmail: '', // empty → honest "channel at launch" state on /contact/
  },
  social: {} // intentionally empty; no fake profiles
};

export const absoluteUrl = (path) => (config.siteUrl ? config.siteUrl + path : '');
