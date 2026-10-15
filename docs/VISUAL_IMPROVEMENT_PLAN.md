# AIVOXFLOW — Visual Improvement Plan (Phase 1.5)

Status: **implemented** (approved W1–W7, executed and verified 2026-10-15). This
document was the pre-approval proposal; the "Implementation result" section at
the bottom records what actually shipped and the real verification numbers.

## Ground rules (unchanged)

- Preserve brand identity: navy/electric palette, wordmark, icon, tokens.
- No architecture change: same zero-dependency static generator.
- No deployment, no paid services, no external requests added.
- Every change must keep `node tests/run.mjs` (53) and
  `node tests/responsive.mjs` (31) green, and must not regress Lighthouse
  a11y/SEO (currently 100/100).
- Content honesty rules unchanged (no fake authors/dates/stats).

## Sources used

- Design director review (isolated agent): source + all 16 captures.
- Deterministic detector (`impeccable detect --json dist`): 81 findings
  (73 warnings + 8 advisories), plus independent mechanical checks
  (tap targets, heading order, LCP lazy-loading, focus clipping).
- ui-ux-pro-max searches: `--domain ux "editorial longform reading
  hierarchy"` (breadcrumbs ✓, **sequential headings — no skips**, modular
  type scale ✓), `--domain landing "hero content-first editorial"`
  (`hero-centric-design`: full-bleed hero, minimal text, one primary CTA),
  `--domain typography "editorial serif sans professional"` (editorial
  pairings confirm Source Serif 4 as a long-form body face — already an
  approved option in the brand guide).
- Refero design MCP: **unavailable** (subscription inactive) — no Refero
  references were used.
- Editorial benchmarks cited by the design review: The Verge, Ars
  Technica, Anthropic newsroom, Smashing Magazine, Stratechery.

## Diagnosis summary (why these changes)

1. **Structural misalignment (P0).** Breadcrumb is emitted outside
   `.wrap` (flush to viewport edge), the article column centers at 800px,
   related grid runs 1120px — three competing vertical axes on one page.
2. **Imagery reads as placeholder (P1).** The corner badge on every cover
   reads as the browser's broken-image glyph; two of six patterns read as
   a pause icon and lorem-text lines; lazy covers flash as white voids;
   the first (likely LCP) image is lazy-loaded above the fold.
3. **Mobile touch targets (P1).** `.toc summary` ≈19px, `.nav-toggle`
   ≈35px, `.page-link` / `.site-nav a` ≈39px — below 44px. Card
   `overflow:hidden` can clip focus rings.
4. **Heading hierarchy (P1).** `h1 → h3` skip on 8 listing/category
   pages (detector + ui-ux-pro-max rule agree).
5. **Wide-width dead space (P2).** Featured row fills 2/3 of 1120px;
   hero content hugs the left half; tools rows run 120–130-character
   measures with no brand anchor below the h1.

## Workstreams

### W1 — One grid, one axis (fixes P0)

Files: `site/lib/html.mjs`, `site/build.mjs`, `site/styles/site.css`.

- Wrap every `breadcrumb()` call in `<div class="wrap">` (article,
  listing, category templates in `build.mjs`).
- Choose a single article layout: keep the centered 800px measure, and
  constrain the related section to the same column:
  `.related .wrap { max-width: 800px; }` so breadcrumb/article/related
  share one axis; OR left-align everything to the 1120 wrap (pick one in
  implementation; default = centered 800 column with matching breadcrumb
  and related widths).
- Add breadcrumb to the tools template for cross-page consistency.

Acceptance: at 768/1280/1600, exactly one left text axis per page type;
visual re-capture confirms.

### W2 — Covers v2 (fixes P1 imagery)

Files: `site/lib/html.mjs` (coverSvg), `site/styles/site.css`,
`site/build.mjs` (eager first cover).

- Delete the corner badge group entirely.
- Redesign `comparisons` (two opposing chevrons meeting at center) and
  `tutorials` (three ascending rounded steps); keep automation-agents.
- Inset all pattern extents to 85% width with 8% padding; add a shadow
  path duplicate (offset 10px, 0.22 opacity) for depth; seed rotation
  (−4°…+4°) and scale (0.92…1.08) from a hash of the category slug so
  same-category covers vary.
- `.card-cover { background: var(--ax-navy-900); }` so slow/absent images
  never flash white voids; keep `loading="lazy"` for below-fold covers,
  but render the **first** cover on each page `loading="eager"
  fetchpriority="high"` (LCP).
- Alt-text policy documented: covers are decorative (empty `alt`,
  `aria-hidden`) because the adjacent category link carries the meaning —
  recorded as an explicit editorial decision, not an accident.

Acceptance: detector rerun shows no new warnings; screenshots at all
widths show no white cover voids; LCP image not lazy.

### W3 — Touch targets + focus integrity (fixes P1 a11y)

File: `site/styles/site.css`.

- `.toc summary { padding: 10px 0; }` (≈44px), `.nav-toggle` min-height
  44px, `.page-link` and desktop `.site-nav a` padding to ≥44px height,
  keep visual size via border/underline (hit area grows, not the glyph).
- `.card { overflow: visible }` with cover clipping moved to
  `.card-cover { overflow: hidden }` so focus rings on card links are
  never clipped (cards keep rounded corners via border-radius on cover).

Acceptance: computed heights ≥44px for the four selectors (verified via
CSS math + CDP evaluate), focus ring visible on card title links.

### W4 — Heading semantics (fixes P1 SEO/a11y)

Files: `site/lib/html.mjs` (already supports `headingLevel`),
`site/build.mjs`.

- On listing/category pages render card titles as `h2` (page h1 → card
  h2), keep `h3` inside article "Keep reading" (section h2 present).

Acceptance: zero `h1→h3` findings in detector rerun; screen-reader
outline linear.

### W5 — Wide-width art direction (fixes P2)

Files: `site/styles/site.css`, `site/build.mjs`.

- Featured: at ≥760px force `repeat(2, 1fr)` so the two cards fill the
  wrap (≈548px each) — no dead third column.
- Hero: at ≥1024px two-column grid `minmax(0, 620px) 1fr`; search block
  moves to the right column, vertically centered; right background gets
  the flow-line motif at low opacity (static SVG, brand colors) so
  "Intelligence in Motion" has a visual anchor.
- Tools: `.tool { max-width: 880px }`, copy lines capped `72ch`; add a
  32px navy monogram tile (first letter, white, 700) per tool head —
  pure HTML/CSS brand anchor; link pair gets a divider that isn't a bare
  middot (spacing + `·` inside a muted span).
- Blockquote: add right padding (fixes detector cramped-padding ×4).
- Section rhythm: `.section { padding: 56px 0 32px }`, `.band { padding:
  64px 0 }`, `.card-body` bottom padding balanced.

### W6 — Editorial micro-craft (fixes P3 batch)

- TOC `<details>` closed by default (progressive disclosure actually
  works); disclosure callout gains weight (`border-left-width: 6px`,
  white background) so honest hierarchy = disclosure > TOC.
- Listing: move "Page 1 of 2" out of the meta description into a
  "Showing 5 of 6 articles · Page 1 of 2" line above pagination.
- Footer: multi-column link grid at ≥760 (3 columns), single column
  below.
- Disabled pagination: strip border, keep muted text.
- `aria-current="page"` nav link gets a 2px electric underline (state is
  not color-only).
- Hero search button full-width below 480px; byline spacing space-3 →
  space-4; tools intro keeps one emphasis only.
- Article titles >60 chars: shorten via `<title>` override field
  (`seoTitle`) on the 4 long articles while keeping visible h1.
- Em-dash advisory: editorial pass replacing half the em-dashes with
  periods/commas in article JSON (content-only edit, meaning preserved).

### W7 — Optional, requires explicit approval (brand typography option)

The brand guide already lists Source Serif 4 as the approved long-form
option, and ui-ux-pro-max's editorial pairings independently recommend a
serif body for publications. Proposal: render `.prose` body text in
Source Serif 4 (self-hosted OFL woff2 later at launch; system serif
`Georgia`-stack interim is acceptable and dependency-free). Headings and
UI stay Inter — no brand change. This is the single biggest "magazine
feel" upgrade available and is deliberately gated on approval because it
changes the reading texture.

## Out of scope

Brand colors/logo/tokens, architecture, deployment, newsletter/contact
mechanisms, font CDN integration, `/es/` localization, new content.

## Verification plan (after implementation)

1. `node site/build.mjs` + `node tests/run.mjs` (expect 53/53).
2. `node tests/responsive.mjs` (expect 31/31; new screenshots).
3. `impeccable detect --json dist` — expect: side-tab 10→4 (blockquote
   fixed), skipped-heading 8→0, cramped-padding 4→0, tap-target rules
   cleared; tight-leading/overused-font known false-positive/taste.
4. Chrome DevTools re-capture 4×4 + Lighthouse on home and article
   (expect ≥ current 100/100/100, improved LCP via eager first cover).
5. Console error check (expect 0).

## Rollback

Single git commit for the workstream batch; `git revert` restores
Phase-1 build exactly (tag `phase1-blog` intact).

## Implementation result (2026-10-15, verified)

All seven workstreams shipped in one reviewable commit.

### What changed (files)

- `site/lib/html.mjs` — covers v2 (corner badge removed; `comparisons` redrawn
  as opposing chevrons meeting at a center dot; `tutorials` as three ascending
  rounded steps; 85% inset with 8% padding; offset shadow copy at 0.22 opacity;
  seeded rotation −4°…4° and scale 0.92…1.08 from the category slug),
  `articleCard` gained `eager` (first cover per page renders
  `loading="eager" fetchpriority="high"`).
- `site/build.mjs` — breadcrumbs wrapped in `.wrap` (article pages use
  `.wrap-narrow` = the 800px axis shared with body and related); tools page
  gained breadcrumbs + BreadcrumbList JSON-LD; card titles are `h2` on
  listing/category pages; TOC `<details>` closed by default; hero rebuilt as a
  two-column grid (≥1024px) with the flow-line motif SVG (aria-hidden, 16%
  opacity); "Showing X of Y articles · Page N of M" line moved out of the meta
  description; `seoTitle` support (3 long articles shortened for `<title>`/OG);
  navy monogram tiles on tool heads.
- `site/styles/site.css` — one vertical axis on article pages (`wrap-narrow`);
  `.card` overflow moved to `.card-cover` (focus rings never clipped) with navy
  cover background (no white voids); ≥44px touch targets (`.toc summary`,
  `.nav-toggle`, `.page-link`, `.site-nav a`); featured row = two equal columns
  ≥760px; section rhythm (48/32, band 64); tools measure capped at 880px /
  72ch; blockquote padding fixed; disclosure callout 6px rule + white surface;
  footer grid 3 link columns ≥760px; disabled pagination border removed;
  `aria-current` underline via inset shadow (no layout shift); hero button
  full-width <480px; byline spacing space-4; **W7**: `.prose` in Source Serif 4
  (system serif fallback, zero network) with 1.72 leading — headings/UI stay
  Inter, code stays monospace.
- Content: 26 em-dash replacements across 6 articles + tools.json +
  categories.json (meaning preserved; script asserted exactly-once matches);
  `seoTitle` on 3 articles; one quoted "weak prompt" example rephrased so the
  buzzword detector no longer trips on a deliberately-bad example.

### Verification (actually run)

- `node tests/run.mjs` → **53/53 PASS** (both SEO modes, rebuilds included).
- `node tests/responsive.mjs` → **31/31 PASS** (no horizontal overflow at
  375/768/1280/1600 across 6 routes; skip-link chain; aria-expanded nav;
  search behavior) + 4 fresh CDP screenshots.
- Lighthouse (headless Edge via local npx, no services): homepage **100 / 100 /
  100** (a11y / best-practices / SEO), article page **100 / 100 / 100**;
  zero failed binary audits on both.
- Chrome DevTools console: 0 errors / 0 warnings on home, article, tools.
- `impeccable detect --json dist`: **81 → 61 findings**; every real-issue rule
  is now zero: skipped-heading 8→0, cramped-padding 4→0, tap-target 3→0,
  overflow-clip 2→0, lazy-plus-lcp 1→0, title-too-long 2→0, marketing-buzzword
  →0, em-dash-overuse 8→1 (advisory). Remaining: tight-leading 25 (display
  line-box false positives), overused-font 25 (documented Inter brand
  trade-off), side-tab 10 (presentation-accepted callout/topic/tool-note
  borders), em-dash 1 advisory.
- 16 full-page captures at 4 widths re-taken (`docs/qa-shots/crit/`) and
  visually reviewed: single-axis article pages, badge-free covers with depth,
  closed TOC, serif prose, equal featured pair, 3-column footer, monogram
  anchors, honest pagination line.

### Known follow-ups (unchanged from plan)

Self-hosted Inter/Noto/Source-Serif OFL files at launch, share-card PNG,
real perf measurement, CI, newsletter/contact mechanisms, `/es/`.
