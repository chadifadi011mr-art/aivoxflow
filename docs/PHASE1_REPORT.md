# AIVOXFLOW — Phase 1 Delivery Report (Blog Interface)

Date: 2026-10-15 · Branch: `master` · Nothing deployed; no paid service used.

## 1. Audit summary (before any change)

- Repository contained: brand assets (`brand/`), planning docs, `.env.example`,
  one git commit (`f43713b`, tag `phase0-brand`). **No website code existed.**
- `brand/preview.html` was — and remains — an isolated QA page, separate from
  the website. The site imports the same source of truth
  (`brand/tokens.css`) at build time, so brand and site cannot drift.
- Reusable from Phase 0: tokens, wordmark/icon/favicon + PNG icons, verified
  WCAG palette, editorial voice, category taxonomy, implementation plan.
- Local tooling evidence: Node v24, Python 3.14, PHP 8.4 **without MySQL**,
  Edge headless. No free PHP+MySQL host selected or verified.

## 2. Stack decision (documented deviation — technical reason)

AGENTS.md defaults to WordPress. Building on it *now* was not possible or
advisable:

1. No verified free host with PHP+MySQL exists yet (free-phase rules 2–3
   require inspecting the host first), and the local machine has no MySQL —
   WordPress could neither run nor be tested.
2. Phase-1 deliverables (static editorial pages, sitemap/robots, structured
   data, minimal JS) are native to a static architecture.
3. Static output deploys to **any** free host (GitHub Pages / Cloudflare
   Pages / Netlify / any file host) with zero database, cron, or API — the
   strongest fit for `AIVOXFLOW_FREE_PHASE_REQUIREMENTS.md`.

**Built:** a zero-dependency Node static generator (`site/` → `dist/`).
Content lives in portable JSON; a later move to WordPress (once a host is
verified) is a content import, not a rewrite. Reversal condition: if the
owner verifies a PHP+MySQL free host and prefers WordPress, this decision is
revisited before Stage 2.

## 3. Files created / modified

**Created — engine & config**

- `site/config.mjs` — URL from `AIVOXFLOW_SITE_URL` env only (never
  hardcoded), optional `AIVOXFLOW_BASE_PATH` for sub-path hosts, feature
  gates (`newsletter: false`, `contactEmail: ''`).
- `site/build.mjs` — builder: 25 routes, asset pipeline, search index,
  conditional sitemap/robots/canonical.
- `site/lib/markdown.mjs` — escape-first safe Markdown subset (headings,
  ul/ol, quotes, code, links with scheme allowlist) → HTML + TOC headings +
  word counts. No raw-HTML passthrough by design.
- `site/lib/html.mjs` — layout, header/footer, cards, breadcrumb,
  pagination, original per-category SVG cover art.
- `site/lib/content.mjs` — loads/validates content, reading time from real
  word counts, related articles, pagination.
- `site/serve.mjs` — preview server with real 404.html behavior.
- `site/styles/site.css` — full site styles on brand tokens.
- `site/scripts/site.js` — nav toggle + client-side search (< 5 KB, no
  dependencies, no third parties).

**Created — content (all dated 2026-10-15, real creation date)**

- `site/data/categories.json` — the 6 required categories.
- `site/data/articles/*.json` — 6 articles (desk-researched, disclosure
  block, byline `AIVOXFLOW Editorial`, sources section, no invented data).
- `site/data/pages.json` — about, contact, privacy, editorial policy,
  corrections, affiliate disclosure, terms (honest placeholder states).
- `site/data/tools.json` — 4 tools with dated official-source verification
  metadata (ChatGPT/Claude/Gemini free tier verified on official pages
  2026-10-15; Perplexity marked **partial** — could not verify from an
  official page).

**Created — docs & tests**

- `docs/PHASE1_IMPLEMENTATION_PLAN.md`, `docs/PHASE1_REPORT.md` (this file).
- `docs/qa-shots/` — 9 QA screenshots (5 Edge-headless + 4 CDP).
- `tests/run.mjs` — 53 checks (build/routes/links/HTML-a11y/contrast/
  honesty fields/SEO modes/HTTP codes/budgets).
- `tests/responsive.mjs` — 31 checks via Chrome DevTools Protocol (real
  viewport emulation 375/768/1280/1600, overflow element detection,
  keyboard skip-link, mobile-nav aria, search behavior, screenshots).

**Modified:** none of the Phase-0 files. (`brand/` untouched.)

## 4. Test results — actually run

| Suite | Result | Covers |
| --- | --- | --- |
| `node tests/run.mjs` | **53/53 PASS** | 25 routes exist, all internal links/anchors resolve, HTML structure (doctype/lang/title/description/single h1/skip-link/alt/width-height/labels/valid JSON-LD/no external script or stylesheet), 9 contrast pairs from live tokens (incl. the documented electric-500/navy-900 **fail** assertion), search index completeness, disclosure/byline/date honesty fields, **both** SEO modes (no canonical/sitemap without SITE_URL; emitted with it), HTTP 200 on every route + HTTP 404 on unknown, JS < 5 KB, CSS < 40 KB |
| `node tests/responsive.mjs` | **31/31 PASS** | zero horizontal overflow on 6 routes × {375, 768, 1280, 1600}, first Tab → visible skip link → Enter → `#main`, mobile nav collapsed/open with correct `aria-expanded`, search returns "2 results" and renders items, 4 full-page CDP screenshots |
| Lighthouse (homepage) | **Accessibility 100, Best Practices 100, SEO 100 — no failing audits** | via connected browser |
| Lighthouse (article page) | **Accessibility 100, Best Practices 100, SEO 100 — zero failed binary audits** | via connected browser |
| Console errors | **0** on homepage and article page | via connected browser |
| Visual review | 9 screenshots inspected by hand | desktop, mobile 375, tablet 768, article, tools, search |

**Defects found by QA and fixed this session**

1. Numbered lists rendered as paragraphs → ordered-list support added to
   the Markdown renderer (verified `<ol>` in built HTML).
2. Search status text overlapped the search input (over-broad negative
   margin) → scoped to `.section-head + .section-note`.
3. Homepage "Latest" duplicated a Featured article → now excludes featured
   (all 6 articles appear exactly once).
4. Test-suite counting bug (pagination dir counted as an article) → fixed.
5. Build robustness: `rmSync` now retries transient Windows locks; a process
   with its CWD inside `dist/` still blocks rebuilds — `site/serve.mjs`
   exists so preview no longer needs `python -m http.server` (which did).

## 5. Known free-hosting limitations (and compatible alternatives)

| Limitation | State / alternative |
| --- | --- |
| Canonical, sitemap.xml, robots.txt absent in default build | **By design**: emitted only when `AIVOXFLOW_SITE_URL` is set at build time (prevents shipping localhost URLs). Production build sets the real URL — no code change. |
| 404 page | Ships as root `404.html` — natively supported by GitHub Pages/Cloudflare Pages/Netlify. On hosts without custom-404 support, this limitation must be confirmed before choosing the host. |
| Search needs JavaScript | noscript fallback shows browse links; everything else works without JS. |
| Newsletter section | Hidden by config flag until a real, privacy-conscious mechanism exists (no backend in phase 1). |
| Contact channel | Honest "not launched yet" state — no fake email or third-party form. |
| Language URLs | English at root now; generator supports `/es/`-style paths later. No hreflang emitted until genuine translations exist (per rules). |
| Sub-path hosting (e.g. GitHub project pages) | Supported via `AIVOXFLOW_BASE_PATH` env — **not yet tested against a real host** (no host selected). |
| Fonts | System font stack in use; self-hosting Inter + Noto Sans Arabic (OFL) is planned — brand guide requires self-hosting, no third-party font CDN was added. |
| Performance score | Local Lighthouse did not emit a performance category; instead asserted: zero third-party requests, JS < 5 KB, CSS < 40 KB, SVG covers, lazy-loaded images. Real perf numbers require deployment. |

## 6. Completed vs planned

**Completed (implemented + tested):** homepage, article list + pagination,
6 article pages (TOC, disclosure, related, breadcrumbs, JSON-LD), 6 category
pages with empty-state, tools index with verification metadata, search page,
7 supporting policy pages, custom 404, taxonomy + editorial voice, responsive
375–1600, keyboard navigation, reduced-motion/contrast/focus states, SEO
metadata + conditional sitemap/robots/canonical, structured data, test
suites.

**Planned (needs Gate A — host/stack selection):** deployment (approval
required), real-URL SEO verification, custom-domain/subdomain setup, CI
build, newsletter mechanism, contact channel, Inter/Noto self-hosting, share
image (PNG card), `/es/` localization, performance testing on a real host.

## 7. Commands

```powershell
node site\build.mjs                    # build → dist/
node site\serve.mjs 8130               # preview with real 404s
node tests\run.mjs                     # 53 checks
node tests\responsive.mjs              # 31 checks (needs local Edge)
# production-shaped build (example only — set the REAL url at launch):
$env:AIVOXFLOW_SITE_URL = 'https://example'; node site\build.mjs
```

## 8. Rollback

The phase is one git commit; `git revert <sha>` restores Phase 0 exactly
(tag `phase0-brand` also intact). `dist/` is git-ignored build output and can
be deleted at any time.
