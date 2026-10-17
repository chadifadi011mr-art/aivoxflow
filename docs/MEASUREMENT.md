# Measurement — opt-in, privacy-first, zero third parties by default

The site ships **no analytics**. That is a deliberate default, not an omission: the reading
experience must stay free of tracking scripts, and the CSP blocks anything that is not
same-origin.

When you are ready to measure, the build already has the hooks.

## 1. Choose a privacy-respecting tool

Any of these work without cookies or personal data:

- **Plausible / Umami / Matomo (self-hosted)** — one script tag, no cookie banner in most EU
  readings.
- **Cloudflare Web Analytics** — free, no cookies, no fingerprinting.
- **A first-party endpoint** you control.

Avoid Google Analytics 4 unless you are prepared for consent management, cookie banners and a
much heavier script.

## 2. Wire it up

```bash
AIVOXFLOW_ANALYTICS_SCRIPT="https://stats.example.com/js/script.js" \
AIVOXFLOW_ANALYTICS_ENDPOINT="https://stats.example.com/api/event" \
AIVOXFLOW_SITE_URL="https://aivoxflow.com" \
npm run build
```

The build then:

- injects `<script defer src="…" data-endpoint="…">` in `<head>`;
- widens `script-src` and `connect-src` in `dist/_headers` to that origin — and only that origin.

Nothing else changes: no cookies are set by this site, and the search index still runs entirely
in the browser.

## 3. Also do this (free, higher value than pageviews)

1. **Google Search Console** — verify the domain, submit `https://aivoxflow.com/sitemap.xml`,
   and watch Coverage + Core Web Vitals. This is the only source of real query data.
2. **Bing Webmaster Tools** — imports from Search Console in one click.
3. **Lighthouse CI** — already wired in `.github/workflows/ci.yml`; it fails nothing yet, but it
   records performance/SEO/a11y scores per commit.
4. **Server logs** — most static hosts expose request logs; a weekly glance catches 404 spikes
   and hotlinking before they become problems.

## 4. What to review monthly

| Signal | Where | Action if it moves the wrong way |
| --- | --- | --- |
| Indexed pages vs sitemap | Search Console → Pages | Check canonical/hreflang and `noindex` leaks |
| CTR by query | Search Console → Performance | Rewrite titles/descriptions of high-impression, low-CTR pages |
| LCP / CLS / INP | PageSpeed Insights, field data | Fix the specific element; do not "optimise" blindly |
| 404s | Host logs | Add redirects for moved URLs |
| Referring domains | Any backlink tool | Content that earns links, not link buying |

## 5. Rules

- No fingerprinting, no cross-site identifiers, no selling data.
- The privacy policy must name the tool actually in use before it is enabled.
- If a tool needs a cookie banner, that is a signal to pick a different tool.
