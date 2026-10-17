# Deployment readiness & search-engine standards review — 17 October 2026

Independent expert review of the current working tree. Every claim below was re-verified by
running the code; nothing is copied from other reports without a fresh check. The tree under
review includes the uncommitted remediation of 2026-10-17 (`REMEDIATION_2026-10-17.md`) plus
its uncommitted follow-up work (55 changed/untracked paths at review time).

## Verdict

**Engineering: ready.  Operations: not yet.** The site is of high build quality and passes
every search-engine standard that can be checked before a host exists. Three operational gaps
stand between this tree and a safe launch — all of them fixable in minutes, none of them
visual or architectural.

| Dimension | Grade | Evidence |
| --- | --- | --- |
| Structural quality (build, tests) | A | providers 27/27, structural 102/102, responsive 31/31 — fresh runs, full rebuild |
| On-page SEO (27 routes) | A− | 107/109 independent audit checks; 2 minor defects (D1, D2 below) |
| Indexation controls | A | canonical self-reference everywhere; `/search/` + `404` noindex; sitemap excludes both |
| Structured data | A | Article (headline/dates/image/author/publisher+logo), BreadcrumbList, WebSite, Organization, ItemList — JSON-LD parses on every page |
| Feeds | A | RSS 6 items with guid/pubDate; JSON Feed valid; no localhost leaks |
| Performance & Core Web Vitals | A | Lighthouse (production build, Edge headless): home 91/100/100/100, article 96/100/100/100; CLS 0–0.001; LCP 2.0–2.6 s |
| Security headers & privacy | A | strict self-only CSP, HSTS 2y+preload, nosniff, COOP, immutable assets; zero third-party subresources |
| Governance (autonomous publishing) | A | pipeline cannot write `site/data/articles/` without explicit `--publish` after all gates; mock research fails gates; future-dated articles stay hidden |
| Release operations | **D** | nothing committed (55 paths); CI branch mismatch; SITE_URL not wired into host build |

## What was verified green (re-run, not trusted)

1. `node tests/providers.mjs` → 27/27 (offline stub server, no keys, no network).
2. `node tests/run.mjs` → 102/102; `node tests/responsive.mjs` → 31/31 (fresh `dist/`, both env branches).
3. Production build `AIVOXFLOW_SITE_URL=https://aivoxflow.com node site/build.mjs` → 27 routes,
   fingerprinted CSS/JS, atomic swap.
4. Independent audit script over all built pages: titles unique, one `h1` per page, canonicals
   self-referencing and unique, `lang=en` everywhere, zero external subresources, sitemap 25 locs
   with no double slashes and real per-route `lastmod` (2 distinct values: 2026-10-15, 2026-10-17),
   `robots.txt` → sitemap, feeds well-formed, every referenced `og:image` file exists in `dist/`,
   hreflang correctly absent for a single locale.
5. Pagination: `/articles/page/2/` self-canonicalizes and carries `rel=prev`; last page has no `next`.
6. `_headers` in `dist/`: CSP (`default-src 'self'` … `frame-ancestors 'none'`, `object-src 'none'`),
   `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`, nosniff, COOP,
   immutable caching for fingerprinted assets, `must-revalidate` for HTML.
7. Lighthouse 13 on the production build served locally (Edge headless, mobile emulation):
   home **91/100/100/100**, article **96/100/100/100** (perf/a11y/BP/SEO); TBT 330 ms home,
   120 ms article; CLS 0 / 0.001. The failing perf audits (unminified JS, unused CSS,
   cache lifetimes, render-blocking) are artefacts of the local static server — no compression,
   no cache headers, no HTTP/2. Re-measure on the real host before quoting numbers publicly.
8. Governance: `agents/stages/qa.mjs` documents and enforces that the pipeline never writes into
   `site/data/articles/` on its own; `--publish` is a separate explicit step after `runGates()`;
   mock-provider research is a blocking gate failure.
9. Security hygiene: no secret patterns anywhere in the tree, no `.env`, `.env.example`
   contains placeholders only.

## Confirmed defects

### P1 — must fix before any deploy

**D1 — `AIVOXFLOW_SITE_URL` is not wired into any host build.**
`netlify.toml` and `vercel.json` both run `npm run build` with no environment; the URL exists
only as a dashboard step the operator must remember. If it is forgotten, production silently
ships **without canonicals, sitemap, robots.txt and feeds** — a catastrophic, invisible SEO
failure. Worse, CI hard-codes `https://aivoxflow.com` while the domain is not yet secured
(Gate A); if the launch domain differs (e.g. a free subdomain), every canonical, sitemap loc
and OG URL would point at a non-resolving host.
*Fix:* (a) make the build fail loudly when `AIVOXFLOW_ENVIRONMENT=production` (or `CI`/host
env markers) and `AIVOXFLOW_SITE_URL` is empty; (b) after the host+domain are chosen, set the
env var in the host dashboard to the **real** launch URL and keep CI in sync; (c) post-deploy,
`curl -sI https://<host>/sitemap.xml` must return 200.

**D2 — the entire release exists only as an uncommitted working tree (55 paths).**
No commit, no tag. A disk accident or a stray `git checkout` loses the deployment-ready state,
and CI — once the repo is pushed — would build the old `ac230e4` commit, which lacks all of it.
*Fix:* commit the tree as a release candidate and tag it (needs the owner's approval; this
review deliberately did not touch or stage any pre-existing file).

**D3 — CI will never run: `.github/workflows/ci.yml` triggers on `main`, the repository branch is `master`.**
*Fix:* change the trigger to `master` (or rename the branch when the remote is created).

### P2 — fix at or immediately after launch

**D4 — duplicate meta description.** `/articles/` and `/articles/page/2/` emit the identical
description. The build already rejects duplicate *article* descriptions; the pagination page
reuses the listing description. *Fix:* give page 2 its own description (e.g. "Page 2 of the
AIVOXFLOW archive …") or derive it from the page number.

**D5 — `_headers` omits the `/search/*` noindex rule** that `netlify.toml` and `vercel.json`
carry. Indexing is still protected by the `<meta name="robots" content="noindex, follow">`
in the page itself, so this is a redundancy/consistency gap on hosts that read only `_headers`.

**D6 — Vercel CSP drift.** `vercel.json` freezes the CSP; the analytics-driven widening built
into `dist/_headers` cannot apply there. Any future analytics origin must be edited in two
places (README already warns — enforce it with a test).

**D7 — trailing-slash behaviour unverified on the chosen host.** Vercel is configured
(`cleanUrls` + `trailingSlash: true`); for Netlify/Cloudflare verify after deploy that
`/articles` 301s to `/articles/` and that both never return 200.

### P3 — known and accepted

- Six articles ≈ 400 words each: thin for topical authority. Launch is fine; rankings are not.
  The gated calendar (with human `--publish`) is the correct remedy — keep it fed.
- `site.js` is not minified (8 KB, fingerprinted). Worth a build-time minify later.
- README says "89 structural checks"; the suite is now 102 — doc drift.
- Local Lighthouse numbers were taken over `localhost`; the failing perf audits listed there
  (cache, compression, render-blocking) do not reflect the real host.

## Launch checklist (ordered, after Gate A decides host + domain)

1. Approve commit + tag of the current tree (D2), fix D3 (branch), D1 (build guard), D4, D5.
2. On the host: set `AIVOXFLOW_SITE_URL` to the **real** launch URL; redeploy; confirm
   `sitemap.xml`, `robots.txt`, `feed.xml` return 200 and canonicals match the live host.
3. Live verification: `/` + one article + `/articles/page/2/` + `/search/` (noindex) + a bogus
   URL (custom 404 with status 404); confirm trailing-slash redirects (D7); confirm HSTS/CSP
   headers are actually served; re-run Lighthouse against the live URL and record results.
4. Search Console: add the property, submit `sitemap.xml`, request indexing of the homepage
   and the six articles. Only after this does analytics/privacy documentation need its final pass.

## Files touched by this review

None in the project tree except this document. Audit helpers stayed in the system temp
directory (`seo-audit.mjs`, `dups.mjs`, `lh-sum.mjs`, Lighthouse JSON reports).
