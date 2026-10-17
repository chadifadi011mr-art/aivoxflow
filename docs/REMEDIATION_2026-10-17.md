# Remediation report — 17 October 2026

Response to the readiness audit in [`AUDIT_2026-10-17_AR.html`](AUDIT_2026-10-17_AR.html).
Every P0 defect and every P1 engineering gap is closed except the two that are editorial
work rather than code (see "Deliberately not done").

## Verification

```
node tests/run.mjs         → 89/89 checks passed
node tests/responsive.mjs  → 31/31 checks passed
routes generated           → 27
```

Both suites now rebuild from scratch, so results do not depend on leftover state.

---

## P0 — critical defects

| # | Defect | Fix | Evidence |
| --- | --- | --- | --- |
| 1 | Sitemap URLs contained `//` on every entry | `emit()` now normalises a route once (`/x/`, never `/x//`); `absoluteUrl()` concatenates a single path | `sitemap.xml` has 25 locs, zero double slashes (asserted in tests) |
| 2 | `<lastmod>` was the build date for every page | Per-route date map: articles use `updated ?? published`, categories use their newest article, static pages use `config.contentUpdated`, tools use the newest verification date | `sitemap.xml` shows real content dates |
| 3 | `BreadcrumbList` emitted as `itemListElement: []` without a site URL | `breadcrumbsLd()` returns `null` (block omitted) and drops `item` for the current page | test: *no empty BreadcrumbList without SITE_URL* |
| 4 | No `og:image` anywhere | 8 pre-rendered 1200×630 PNGs in `site/assets-src/og/`, one per article plus default/tools; `twitter:card=summary_large_image`, `og:image:width/height/alt` | test: *og card for every slug* |
| 5 | Article schema missing required fields | Added `image`, `publisher.logo`, `dateModified`, `inLanguage`, `mainEntityOfPage`, `keywords`, author `url` | test: 9 structured-data assertions |
| 6 | `absoluteUrl()` ignored `basePath` | Base path is part of every absolute URL | verified with `AIVOXFLOW_BASE_PATH=repo`: canonical, sitemap and feeds all include `/repo/` |
| 7 | Non-atomic build wiped `dist/` first | Build writes `dist.tmp/`, then swaps; the live tree is restored if the swap fails | test: *atomic build leaves no dist.tmp behind* |

## P1 — engineering gaps

**Release engineering**
- `package.json` with scripts (`build`, `dev`, `test`, `test:responsive`, `verify`, `og`) and `engines: node >= 20.11`.
- `README.md` documenting configuration, content model, pipeline and deployment.
- `.github/workflows/ci.yml`: build → 89 checks → responsive checks → Lighthouse CI.
- `netlify.toml`, `vercel.json`, and a generated `dist/_headers`.

**Performance & caching**
- CSS and JS are fingerprinted (`site.<hash>.css|js`) and served `immutable` for a year.
- CSS is minified by a quote-aware minifier (26 KB → 18 KB raw).
- HTML stays under 24 KB (asserted).

**Security**
- CSP (`default-src 'self'`, no `unsafe-inline`), HSTS, `nosniff`, `DENY` framing, Referrer-Policy,
  Permissions-Policy, COOP — generated per build, widened only for a configured analytics origin.
- Inline `style=""` attributes removed from the Markdown renderer (table alignment is class-based now),
  so the strict CSP holds.
- `site/serve.mjs` no longer allows `../` traversal outside `dist/`.

**Content platform**
- Markdown now supports GFM tables with alignment, images with automatic width/height (PNG/JPEG/GIF/WebP/SVG
  header parsing), figures with captions, `####`, `---`, and nested lists — the "Comparisons" pillar is
  now technically possible.
- Build fails on duplicate slug, duplicate title or duplicate description (silent overwrite is gone).
- Optional `updated` field renders "Updated …" and feeds `dateModified`.
- Tags are first-class: shown on articles, used to rank related articles, emitted as `article:tag`.

**Discovery & distribution**
- RSS 2.0 (`/feed.xml`) and JSON Feed (`/feed.json`), siteUrl-gated, linked from `<head>` and the footer.
- `/search/` is `noindex,follow` and excluded from the sitemap.
- `rel="prev"/"next"` on paginated lists.
- `/authors/editorial/` page with `Organization` schema and `knowsAbout`, linked from every byline.
- `/tools/` gained an at-a-glance comparison table and `ItemList` schema.

**Search**
- Full-text index (6 000 chars per article, was 1 500), AND-token matching, weighted scoring,
  `<mark>` highlighting built with DOM nodes (never `innerHTML`), topic filter, 120 ms debounce,
  `combobox`/`listbox` ARIA with arrow-key navigation and `aria-activedescendant`, shareable `?q=` state.

**Reader experience**
- Share row (X, LinkedIn, copy-link with live status) — no third-party script, no tracking.
- Author box, tags, updated-date line, print stylesheet.
- Duplicate H2 that repeated the page title removed from six static pages.

**Honest channels**
- `/newsletter/` renders a real form only when `AIVOXFLOW_NEWSLETTER_ACTION` is set; otherwise it states
  the list is not open and points at RSS.
- `/contact/` publishes a monitored `mailto:` only when `AIVOXFLOW_CONTACT_EMAIL` is set; otherwise it says so.
- Opt-in analytics hooks (`AIVOXFLOW_ANALYTICS_SCRIPT` / `_ENDPOINT`) — nothing loads by default.

**Internationalisation**
- `lang`/`dir` plumbing, Intl date formatting, Unicode-aware `slugify()` (Arabic/Cyrillic/CJK anchors work),
  and inert `hreflang`/`x-default` output that activates only when `config.locales` has more than one entry.
- `docs/I18N.md` documents exactly what remains before a second language can ship.

## Deliberately not done

1. **Content depth.** Six articles at ~400 words is still the single biggest competitive gap. Writing thirty
   1 200-word articles requires verified sources; inventing them would violate `AGENTS.md` rule 5. The engine
   now supports the formats those articles need.
2. **Named author entities.** No real named people are available, so the byline stays an honest
   `Organization` ("AIVOXFLOW Editorial") with its own page. A fabricated `Person` with a fake bio would be
   worse than none.

## Files added

```
package.json  README.md  netlify.toml  vercel.json
.github/workflows/ci.yml
site/lib/assets.mjs  site/lib/imagesize.mjs
site/og/generate.mjs  site/assets-src/og/*.png  (8 cards)
site/data/authors.json
docs/I18N.md  docs/MEASUREMENT.md
```
