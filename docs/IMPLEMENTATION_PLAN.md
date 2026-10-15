# AIVOXFLOW — Staged Implementation Plan (v1)
# Source: AIVOXFLOW_MASTER_IMPLEMENTATION_PROMPT.md + AGENTS.md + AIVOXFLOW_FREE_PHASE_REQUIREMENTS.md
# Status: Phase 0 (brand) DONE. Stages 1–6 require the approval gates below.

## Repository inspection (completed before any code)

- Repository contains only four planning documents; no application code, no
  git history, no database, no tests, no deployment configuration.
- Conclusion: **new project** — no existing site to migrate, nothing at risk.
- Local tooling verified on this machine: git 2.56.0 ✓, Microsoft Edge
  (headless rendering for icon QA) ✓, ImageMagick ✗ (not needed).
- Missing/not yet chosen (blocks Stage 1): target free host + resulting
  stack decision (see Gate A). No credentials exist yet and none are needed
  for Phase 0.

## Stage map

| Stage | Scope | Key outputs | Gate |
| --- | --- | --- | --- |
| 0 Brand | Brand assets, tokens, verified contrast, favicon QA | `brand/*`, `docs/contrast-check.ps1` | DONE (this phase) |
| 1 Foundation | Responsive accessible editorial site: home, categories, search, article template, static pages, empty states, reusable components | site skeleton + theme/components + README | Gate A (host/stack) then Gate B (design review) |
| 2 i18n + SEO | `/en/` first with `/es/ /fr/ /de/ /ar/ /pt/` designed; language switcher; canonical + hreflang + x-default; sitemap, robots, OG, structured data | multilingual routing + SEO validation report | Gate C (SEO output validated) |
| 3 AI workflow | `aivoxflow-core`-equivalent workflow: states idea→…→monitored→update_candidate + rejected/needs_human_review/failed; briefs, drafts with source ledger, fact-check, editorial QA, SEO QA, image step, scheduling, admin review screen, job log, emergency stop | workflow module + admin UI | Gate D (draft-only mode tested) |
| 4 Autonomy + safety | Draft-only default; config for categories/languages/quotas/spend caps/retries/concurrency/publish windows; sensitive-topic hard block; prompt-injection defenses | policy config + enforcement tests | Gate E (admin explicitly opts in, per setting) |
| 5 Reliability | Validation/sanitization/capabilities/nonces/prepared SQL; bounded retries with jitter; duplicate prevention; budget ceiling; health view; automated tests for all of the above | test suite + results log | Gate F (all tests actually run + recorded) |
| 6 Analytics loop | Privacy-conscious analytics + Search Console integration points (only when configured); evidence-backed update candidates | integration docs + update-candidate logic | Gate G (admin configures; privacy notice approved) |

## Gate A — host/stack decision (OPEN, blocking Stage 1)

Rule: free-phase rules 2–3 require inspecting the exact free host before
coding. The host has not been selected yet, so no site code is written yet.
Options to decide with the project owner:

1. **Static site generator (recommended for phase one)** on Cloudflare
   Pages / GitHub Pages / Netlify free tiers: fastest, most portable, no
   PHP/MySQL/cron dependencies; the Stage-3 AI workflow runs as local
   scripts producing content committed to the repo (manual queue runner,
   documented per free-phase rule 6).
2. **WordPress on a free PHP+MySQL host** (e.g. InfinityFree-class): matches
   the AGENTS.md preference, but free hosts typically restrict cron,
   outbound API calls, and performance; must be verified on the chosen host
   before committing.
3. **Local WordPress now, host later**: build the preferred stack locally,
   keep deployment target open; slowest feedback, zero host evidence.

Whichever is chosen: domain/host stay configurable, mocks are used for AI
providers, and no paid service is activated.

## Acceptance tests per stage (summary)

- Stage 1: Lighthouse-style checks by hand (load, mobile layout, keyboard
  navigation, contrast spot-check with the palette), empty states reviewed,
  no fabricated content anywhere.
- Stage 2: hreflang/canonical output validated on sample pages; language
  switcher persists manual choice; no IP-based locking; sitemap lists only
  indexable canonicals.
- Stage 3: state machine tests (legal/illegal transitions), source ledger
  attached to every draft, QA failure blocks scheduling, duplicate
  fingerprint prevents double posts.
- Stage 4: emergency stop halts all jobs; budget ceiling stops generation;
  sensitive categories never auto-publish; embedded instructions in
  retrieved content are ignored (injection test).
- Stage 5: capability/nonce denial tests, SQLi/XSS input tests, retry
  policy bounded (max attempts + jitter), health view admin-only.
- Stage 6: no numbers fabricated; missing analytics degrades gracefully.

## Budget assumptions (phase one)

| Item | Cost | Note |
| --- | --- | --- |
| Hosting | $0 | free tier only; limits documented after host selection |
| Domain | $0 | free subdomain; custom domain configurable for later |
| Fonts | $0 | Inter, Source Serif 4, Noto Sans Arabic (SIL OFL), self-hosted |
| AI providers | $0 | mock adapters only until a free integration is verified; budget caps default to 0 |
| Email/newsletter | $0 | slot hidden until configured |
| **Total** | **$0** | paid services require explicit approval + cost documentation first |

## Rollback strategy

- `git init` + initial commit of the brand phase = rollback point R0.
- Every stage lands as one or more reviewable commits; rollback = revert to
  the previous tag/commit. Tags: `phase0-brand`, then `stage1`, `stage2`, …
- Database migrations (Stage 3+, if WordPress/DB chosen): forward +
  documented reverse SQL; backups taken before applying (see free-phase
  rule 7 — export + verified restore before phase one is "complete").
- Nothing is deployed to any host in phase 0–1 without explicit approval.

## Next actions

1. Owner picks an option in Gate A (host + stack).
2. Stage 1 scaffolding starts in the chosen stack (approval: implicit by
   the Gate A answer).
3. Wordmark text converted to outlines after typeface approval (brand §2).
