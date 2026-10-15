# AIVOXFLOW — Phase 1 Blog: Audit + Implementation Plan

## 1. Audit (completed before changes)

- Repository: brand assets (`brand/`), docs, `.env.example`, git (1 commit,
  tag `phase0-brand`). **No website code exists yet** — `brand/preview.html`
  is an isolated QA page, not a site.
- Reusable from Phase 0: `brand/tokens.css` (source of truth, copied at
  build), `brand/logo-icon.svg` / wordmarks / favicon / PNG icons, verified
  WCAG palette, brand guide (voice, taxonomy).
- Local tooling: Node v24 (build/test), Python (static server), Edge
  headless (icon rendering — proven), PHP 8.4 **without MySQL**.

## 2. Stack decision (documented deviation, with evidence)

AGENTS.md prefers WordPress; free-phase rules 2–3 require inspecting the
host/stack before coding. Evidence gathered:

- No free host with PHP+MySQL has been selected or verified yet; local
  machine has PHP but **no MySQL**, so WordPress cannot run or be tested
  here.
- Phase-1 deliverables (static editorial site, sitemap, robots, structured
  data, minimal JS) map directly to a static architecture.
- Static output deploys to ANY free host (GitHub Pages / Cloudflare Pages /
  Netlify) with zero database, cron, or outbound API needs — the most
  compatible option with `AIVOXFLOW_FREE_PHASE_REQUIREMENTS.md`.

**Decision:** Phase 1 = zero-dependency Node static generator
(`site/` → `dist/`). Content lives in portable JSON (future WordPress
import is a content migration, not a rewrite). If the owner later verifies
a PHP+MySQL free host and prefers WordPress, this plan is revisited —
nothing here blocks that.

## 3. Build plan

| Step | Output |
| --- | --- |
| Config | `site/config.mjs` — site URL from `AIVOXFLOW_SITE_URL` env (never hardcoded); newsletter + contact gated by config |
| Data | brand/nav strings, 6 categories, 6 articles (desk-researched, honest disclosures), 4 tools (official-source verification metadata), 7 policy pages |
| Engine | safe markdown-subset renderer → HTML (escape-first), layout/header/footer components, SEO head (title/meta/OG/JSON-LD), reading time from real word counts, TOC from real headings, related articles by category |
| Pages | home, `/articles/` + pagination, `/articles/<slug>/`, `/category/<slug>/`, `/tools/`, `/search/`, about, contact, privacy, editorial-policy, corrections, affiliate-disclosure, terms, 404 |
| Assets | tokens.css + site.css (single concatenated file), ~4KB vanilla JS (nav + search), original per-category SVG covers, favicon/manifest, share card PNG (Edge-rendered) |
| SEO | sitemap.xml + robots.txt **only when SITE_URL is set** (no localhost leakage); canonical/og:url likewise; no hreflang until real translations exist |
| Tests | `tests/run.mjs`: build integrity, route existence, internal link check, HTML/a11y structure checks, contrast re-check from tokens.css, search index integrity, HTTP serve test (200s + 404), JS budget |

## 4. Gates honored

No deploy, no paid services, no hardcoded domain, no fake authors/stats/
dates (byline = "AIVOXFLOW Editorial"; all articles dated today = real
creation date; all claims desk-researched with official sources or marked
unverified), newsletter hidden until a real mechanism exists.

## 5. Rollback

Git commit of Phase 1 = rollback point; `git revert` restores Phase 0.
