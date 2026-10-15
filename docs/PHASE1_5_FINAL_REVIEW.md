# Phase 1.5 — Final Quality Review

Date: 2026-10-15 · Status: complete · Baseline: commit `f482ae9` (Phase 1.5 visual pass, accepted)

Scope of this review, as instructed: editorial quality of all six articles, the
70%/30% claim, actual rendered fonts, thumbnail relevance, tool-card clarity,
footer navigation, visual inspection at mobile + desktop, and the full automated
test suite. Constraints honored: the website was not rebuilt (the generator ran
only to apply the two confirmed editorial fixes and the tool-card clarity change
listed in §10), brand identity, stack, and deployment status are unchanged, and
no feature was invented.

Everything below is either an **observed fact with evidence** (labeled
**Confirmed**) or an explicitly labeled **Preference** item.

---

## 1. Editorial quality review — six articles

Method: every article JSON was read in full; the corpus was scanned for
statistical/empirical claim patterns (`%`, "study", "survey", "according to",
"grew/grown", "twice", "data shows", …); each claim was checked against the
article's own disclosure statement and the project's no-unsourced-claims rule.

| Article | Sourcing assessment | Findings |
| --- | --- | --- |
| 01 choose-an-ai-writing-tool | Strong. Free-tier claims link to official pricing pages with a check date; "Sources and further reading" section; disclosure accurately states desk research. | No confirmed issues. Voice note: "Most people choose an AI writing tool the wrong way" / "Three months later the subscription is unused" are anecdotal generalizations — acceptable opinionated opener, no quantitative claim, left unchanged. |
| 02 prompt-patterns-that-work | Appropriate. No factual or quantitative claims; mechanism statements are general knowledge; disclosure states no benchmarks are claimed. | None. |
| 03 automate-repetitive-work | Appropriate. Method/opinion piece; disclosure states no productivity gains are claimed; advice is hedged ("In practice…"). | None. |
| 04 ai-assistants-vs-traditional-software | **Had one violation** (see §2). Disclosure states "no performance benchmarks are claimed", which the 70/30 sentence contradicted. | **Confirmed + fixed:** the 70%/30% claim. Post-fix, body and disclosure are consistent. |
| 05 how-to-verify-ai-news | Strong. Method article with sources section; claims are hedged and self-referential to the editorial policy. | None. |
| 06 browser-based-vs-installed-ai-tools | **Had one weak claim** (see §3). Otherwise consistent with its desk-research disclosure. | **Confirmed + fixed:** "have grown heavy". "Most major AI assistants now ship in both forms" is descriptive, covered by the disclosure; "dramatically more useful" is marked opinion — both left unchanged. |

Summary: 2 confirmed issues found across the corpus, both fixed; 3 voice-level
generalizations identified as subjective and deliberately left unchanged
(opinion is allowed when it reads as opinion; numbers require sources).

## 2. The 70% / 30% writing-work claim — investigated

- **Where:** article 04, "The rise of the assistant" section.
- **Original sentence:** "The assistant does 70% of the writing work; you own
  the last 30%, which is where accuracy lives."
- **Verdict: unsupported.** The numbers are a rhetorical illustration with no
  source, no measurement, and no methodology anywhere in the corpus or in
  `site/data/tools.json`. They also contradicted the article's own disclosure
  ("no performance benchmarks are claimed") — a quantitative split of writing
  work is exactly a performance claim. Per AGENTS.md rule 5 (no unverified
  claims) it could not ship.
- **Fix applied:** "The assistant drafts most of the first words; you own the
  final pass, which is where accuracy lives." Meaning preserved, numbers
  removed. Verified in the rebuilt page (`dist/articles/ai-assistants-vs-traditional-software/`).

## 3. The "grown heavy" claim — investigated

- **Where:** article 06, decision factor 4.
- **Original:** "AI desktop apps have grown heavy." — an empirical trend claim
  (things got heavier over time) with no source.
- **Fix applied:** "AI desktop apps can be resource-hungry." — states the
  practical constraint without asserting a measured trend.

## 4. Rendered font verification — not assumed, measured

Method: Microsoft Edge (headless) driven over CDP; `CSS.getPlatformFontsForNode`
called on real DOM nodes of the built pages. This API reports the platform fonts
actually used to paint each node — the authoritative answer, not a CSS reading.

Evidence (all values from the actual run on the built site):

| Selector | Declared stack (computed) | **ACTUAL font used** |
| --- | --- | --- |
| `.prose p` (article body) | `"Source Serif 4", "Source Serif Pro", Georgia, "Times New Roman", serif` | **Georgia** (206 glyphs) |
| `.prose li` | same serif stack | **Georgia** (44 glyphs) |
| `.prose h2` | `Inter, "Noto Sans Arabic", …, "Segoe UI", …` | **Segoe UI** (35 glyphs) |
| `.article-head h1` | Inter stack | **Segoe UI** (54 glyphs) |
| `.hero h1` (weight 800) | Inter stack | **Segoe UI Black** (23 glyphs) |
| `.card-title a` | Inter stack | **Segoe UI** (54 glyphs) |
| `.brand-text` (weight 800) | Inter stack | **Segoe UI Black** (9 glyphs) |

Findings:

1. **Confirmed:** the body text renders in **Georgia**, not Source Serif 4.
   The serif texture the design intends is real (Georgia is a true serif), but
   the brand typeface itself does not render on this machine because no
   self-hosted font files ship yet. Same for headings: **Segoe UI**, not Inter.
   This machine is representative of stock Windows; macOS/Linux/Android will
   fall to their own stack members (SF/Roboto/DejaVu), so exact typography
   varies by visitor OS until the OFL files (Inter + Source Serif 4 +
   Noto Sans Arabic) are self-hosted — already a planned Phase 1.5 follow-up,
   now evidenced.
2. **Confirmed (method note):** `document.fonts.check('16px "Source Serif 4"')`
   returned `true` even though Source Serif 4 is not installed — the API tests
   CSS font *matching* (which succeeds via fallback), not font *presence*.
   This is exactly why rendered fonts must be verified with platform-font
   attribution, and it documents why a CSS-only check would have produced a
   false "it works" claim.
3. No regression: line-height 1.72 and the serif/sans duality render as
   designed; this is a brand-fidelity gap, not a readability defect.

## 5. Thumbnail relevance review + proposed illustration system

Current state (observed): one deterministic SVG per **category** — 5 cover files
serve all 6 articles (articles 01 and 03 share the ai-tools wave). Covers are
category-true but article-agnostic: article 03 (an automation framework) and
article 05 (a verification methodology) both wear the same wave as article 01
(a tool-selection checklist). Relevance is weakest for 03 and 05.

**Proposed topic-specific editorial illustration system** (not implemented; for
approval):

1. Keep the accepted art direction untouched: navy-900 background, electric-500
   shapes with the offset shadow, ~85% inset, deterministic rotation/scale from
   the slug hash, no text in covers, decorative (`alt=""`, `aria-hidden`).
2. Add an explicit per-article `coverMotif` field in each article JSON, chosen
   by the editor from a fixed vocabulary of ~8 primitives, e.g.:
   `checklist` · `flow-arrows` · `comparison-bars` · `step-ladder` ·
   `shield-verify` · `node-graph` · `document-stack` · `pulse-wave`.
   The motif becomes the article's visual thesis (05 → `shield-verify`,
   03 → `flow-arrows`, 01 → `checklist`, …).
3. Allow at most one accent detail per cover; motif must stay legible at
   thumbnail size; everything deterministic from data (build stays
   reproducible).
4. Cost: motif library in `site/lib/html.mjs` + one field per article; no new
   dependencies; free-hosting compatible.

## 6. Tool cards — clarity and density (implemented)

Problem (observed before): the tools page presented "Free tier: yes (per
official page) · Official site · Verification source" as one run-on line —
three different kinds of information (a fact, and two links) with no visual
structure, and the quote block below had no label tying it to verification.

Change applied (both tools index and homepage picks):

- Structured `<dl class="tool-spec">` label/value rows: **FREE TIER** (value
  carried by text: "Yes — per official page" / "No" / "Not confirmed in our
  check", with `spec-yes/no/unknown` classes as decoration only — never
  color-alone) and, on the tools index, **SOURCES** (Official site ·
  Verification source).
- The quote block gained a **VERIFICATION NOTE** micro-label.
- Homepage badge unified to "Verified <date>" (was "Free tier verified <date>",
  which the new FREE TIER row now answers directly).
- Result: the promise in the intro — "Each entry shows *when* we checked it,
  and against which official page" — is now scannable as data, not prose.
  Verified visually at 375 and 1280 (§8).

## 7. Footer navigation review (documented, not implemented)

Observed structure (`site/lib/html.mjs`): one flat `<ul>` of 9 links inside
`<nav aria-label="Footer">`. The DOM order is logical (content → institutional
→ legal), but the grid renders row-major across 3 columns, producing visual
columns that mix groups:

- Column 1: All articles · Contact · Privacy
- Column 2: AI tools index · Editorial policy · Affiliate disclosure
- Column 3: About AIVOXFLOW · Corrections · Terms

**Confirmed issues:** (a) no group labels — a visitor hunting for legal pages
must read all nine links; (b) the row-major fill scrambles the logical DOM
grouping visually; (c) at ≤759 px the grid drops to 2 columns and "Terms" sits
alone in the last row (minor orphan).

**Proposal:** three labeled sub-lists inside the same landmark —
*Read* (All articles, AI tools index) · *About & standards* (About AIVOXFLOW,
Contact, Editorial policy, Corrections) · *Legal* (Privacy, Affiliate
disclosure, Terms) — with small uppercase group labels matching the existing
`.note-label` eyebrow style. No touch-target or contrast changes. Left
unimplemented because this review was scoped to identify, not redesign.

## 8. Visual inspection log

Seven screenshots in `docs/qa-shots/final/` (committed), captured with Chrome
DevTools at full page, personally reviewed:

| File | What was verified |
| --- | --- |
| `home-375.png` | Mobile hero, stacked featured/latest cards, category list, tool picks with FREE TIER rows, 2-column footer. No overflow; ≥44 px targets; covers show motifs. |
| `home-1280.png` | Desktop hero + motif, 2-col featured, 3-col latest, topic grid, tool picks. Clean. |
| `home-1600.png` | Wide layout + full footer; whitespace rhythm; footer grouping issue (§7) visible. |
| `article-375.png` | Mobile article: wrapped breadcrumb, disclosure, closed TOC, serif body, sources, keep-reading stack. |
| `article-1280.png` | Desktop article on the 800 px axis; serif rendering, h2 rhythm, sources, related cards with motifs. |
| `tools-375.png` | New spec rows at mobile; Perplexity partial-verification badge wraps to its own line (acceptable). |
| `tools-1280.png` | New card anatomy: monogram/name/badge, description, FREE TIER + SOURCES rows, labeled verification note. |

**Method note (confirmed, not a defect):** the first captures showed some lazy
cover images as blank navy rectangles. Verified via DOM inspection that all
covers are real `<img>` elements that load on scroll (`complete: true`,
`naturalWidth: 283`); it was a screenshot-timing artifact of full-page capture,
not a rendering bug. The three affected screenshots were recaptured with a
scroll pass + `img.decode()` before shooting, and motifs render correctly.

## 9. Automated tests (actually run, after the changes above)

- `node tests/run.mjs` — **53/53** (routes, link resolution, a11y basics,
  contrast assertions, conditional SEO, search index, budget guards).
- `node tests/responsive.mjs` — **31/31** (CDP checks at 375/768/1280/1600:
  no horizontal overflow, hero/featured/footer layouts, menu behavior) with 4
  fresh CDP screenshots.
- Console on home / article / tools: 0 errors, 0 warnings (verified in this
  review session).
- No Lighthouse re-run: nothing in this review touches performance-relevant
  assets beyond markup already covered by prior 100/100/100 runs; the CSS delta
  is ~40 lines of static rules.

## 10. Change manifest for this review

| File | Change |
| --- | --- |
| `site/data/articles/04-ai-assistants-vs-traditional-software.json` | 70/30 claim replaced (§2) |
| `site/data/articles/06-browser-based-vs-installed-ai-tools.json` | "grown heavy" softened (§3) |
| `site/build.mjs` | `freeTierLabel`/`freeTierClass` helpers; tool-card `<dl>` structure on tools index + homepage; "VERIFICATION NOTE" label; homepage badge unified |
| `site/styles/site.css` | `.tool-desc`, `.tool-spec` grid, `spec-yes/no/unknown`, `.note-label` (~40 lines, token-based) |
| `docs/PHASE1_5_FINAL_REVIEW.md` | this document |
| `docs/qa-shots/final/*.png` | 7 final-review screenshots |

Nothing else was touched; `dist/` is regenerated and git-ignored.

## 11. Prioritized remaining issues

**Confirmed**

1. **P1 — Brand fonts are not self-hosted** (§4). Inter / Source Serif 4 do
   not render on stock machines; typography varies by OS (Segoe UI / Georgia /
   SF / Roboto fallbacks). Fix: self-host the OFL-licensed font files
   (planned follow-up; now evidenced with platform-font data).
2. **P1 — Footer visual grouping** (§7): flat 9-link grid scrambles logical
   groups; proposal ready (labels + 3 sub-lists).
3. **P2 — Perplexity free tier unverified** (data-level, honestly displayed as
   "Not confirmed in our check"). Re-check when a JS-capable verification path
   is acceptable; the card already handles the state correctly.
4. **P2 — Remaining em-dashes**: a handful remain (tools intro, category blurbs,
   footer meta) — advisory stylistic cleanup only; no meaning issues.

**Preference (subjective, no action required)**

5. Hero search column is top-aligned in the hero at ≥1280 while the left column
   is vertically centered; centering it is a taste call.
6. Category-card left blue border repeated six times — accepted as a rhythm
   device in the Phase 1.5 critique; revisit only with the motif vocabulary
   (§5).

**Planned follow-ups (unchanged)**: self-hosted fonts, cover motif vocabulary
(§5, pending approval), share-card PNG, real perf measurement on free hosting,
CI, `/es/` localization, Gate A free-host selection.
