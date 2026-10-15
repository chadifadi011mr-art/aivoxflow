# AIVOXFLOW — Pre-Deployment Final Check

Date: 2026-10-15 · Baseline: `0cd939c` (Phase 1.5 final review, accepted)
Outcome: **all five tasks complete; nothing deployed; no hosting/DNS changes.**

---

## 1. Typography — self-hosted fonts

### What ships now

Six WOFF2 files (~137 KB total) from the `@fontsource` builds of the official
OFL-licensed sources, stored in `site/assets/fonts/` and copied to
`dist/assets/fonts/` by the build. The OFL license texts ship beside them
(required when redistributing; also good faith):

| File | Size | License |
| --- | --- | --- |
| `inter-latin-400-normal.woff2` | 23.7 KB | OFL 1.1 (`OFL-Inter.txt`) |
| `inter-latin-600-normal.woff2` | 24.3 KB | OFL 1.1 |
| `inter-latin-700-normal.woff2` | 24.4 KB | OFL 1.1 |
| `inter-latin-800-normal.woff2` | 24.5 KB | OFL 1.1 |
| `source-serif-4-latin-400-normal.woff2` | 20.0 KB | OFL 1.1 (`OFL-Source-Serif-4.txt`) |
| `source-serif-4-latin-400-italic.woff2` | 20.1 KB | OFL 1.1 |

Every file was verified as genuine WOFF2 by its `wOF2` magic bytes after
download. No other weights exist because none are used: a corpus + CSS audit
found sans weights 400/600/700/800 and serif 400 roman + 400 italic (the
articles use markdown `*…*` emphasis → `<em>`; there is no `<strong>` and no
serif bold anywhere).

### How it loads

- `@font-face` rules at the top of `site/styles/site.css` with
  `font-display: swap`, relative URLs (`../fonts/…`), and the latin
  `unicode-range` so future Arabic text falls through to the next family in
  each stack.
- **Fallback stacks preserved exactly as before** — the `font-family`
  declarations were not touched (`Inter, "Noto Sans Arabic", …, "Segoe UI", …`
  and `"Source Serif 4", …, Georgia, "Times New Roman", serif`).
- Preload: Inter 400 + Inter 800 on every page (body + brand/hero are on every
  page); Source Serif 4 400 additionally on article and static pages
  (`serifPreload` option in `layout()`).

### Verification — CDP platform-font attribution, not CSS/check()

`CSS.getPlatformFontsForNode` on the built site (same method as the Phase 1.5
review, so before/after is apples-to-apples):

| Selector | Before | **After** |
| --- | --- | --- |
| `.prose p` | Georgia | **Source Serif 4 (custom)** [206 glyphs] |
| `.prose li` | Georgia | **Source Serif 4 (custom)** |
| `.prose h2` | Segoe UI | **Inter (custom)** |
| `.article-head h1` | Segoe UI | **Inter (custom)** |
| `.card-title a` | Segoe UI | **Inter (custom)** |
| `.hero h1` (800) | Segoe UI Black | **Inter ExtraBold (custom)** |
| `.brand-text` (800) | Segoe UI Black | **Inter ExtraBold (custom)** |

`document.fonts.check('16px "Source Serif 4"')` now returns **false** while
the font demonstrably renders (platform-font list + HTTP 200s) — further proof
that API is not a validity oracle and must not be used as one.

Network evidence (Chrome DevTools MCP, article page): all six fonts requested
from the site's own origin, all `200`. Pages load only the weights they need.

## 2. Footer — three labeled groups

`site/lib/html.mjs` now emits the same nine links (none added, none removed)
inside one `<nav aria-label="Footer">`, grouped:

- **Read** — All articles · AI tools index
- **About & Standards** — About AIVOXFLOW · Contact · Editorial policy · Corrections
- **Legal** — Privacy · Affiliate disclosure · Terms

Verification:

- **Keyboard:** focus placed on the first Read link, Tab ×9 recorded the
  sequence: AI tools index → About AIVOXFLOW → Contact → Editorial policy →
  Corrections → Privacy → Affiliate disclosure → Terms. DOM order = visual
  order; no `tabindex` overrides exist.
- **Mobile:** at 375 px the groups stack vertically with visible labels
  (`predeploy-home-375.png` footer).
- **Desktop:** three labeled columns beside the brand block
  (`predeploy-home-1280.png` footer).

## 3. Mobile visual verification — actual 375 px CSS viewport

Method note (honest): `resize_page(375, …)` alone could **not** produce the
requested viewport — it clamped to `innerWidth: 502` (OS minimum window width)
with the host's DPR 1.25. The verification therefore uses Chrome DevTools
device-metrics emulation, `emulate({ viewport: "375x812x1" })`, which sets a
true CSS viewport (confirmed by the tool's own echo:
`{"width":375,"height":812,"deviceScaleFactor":1,…}`) and screenshots are
native captures of that viewport — nothing was resized or cropped.

| Reported value | Measurement |
| --- | --- |
| CSS viewport width (`innerWidth`) | **375 px** (article, home, tools) |
| Device pixel ratio | **1.0** (emulated; host system DPR is 1.25) |
| Screenshot pixel dimensions | home **360×6336**, article **360×6573**, tools **360×3519** (PNG IHDR). Width is 360 because headless desktop Chromium reserves a 15 px classic scrollbar inside the 375 px viewport — real mobile overlay scrollbars do not |
| Browser | Chromium **155** via the Chrome DevTools MCP session; UA `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36` |

Pages verified with full-page screenshots (in `docs/qa-shots/predeploy/`,
personally reviewed): `predeploy-home-375.png`, `predeploy-article-375.png`,
`predeploy-tools-375.png`, plus `predeploy-home-1280.png` for the desktop
footer. No horizontal overflow on any page (`scrollWidth` 360 ≤ viewport).

**Confirmed responsive problems found: 1 — fixed.** Footer links measured
**17 px** tall at mobile, below the project's own ≥44 px touch-target
standard. Fix: `min-height: 44px` inline-flex links in the mobile-first
stylesheet, reverted to compact at ≥760 px (desktop keeps the accepted
rhythm). Re-measured after the fix: **44/44/44/44/44/44/44/44/44**.
Nothing else was changed — every other mobile observation matched the
accepted Phase 1.5 baseline.

## 4. Editorial covers — proposal only (awaiting approval)

The full `coverMotif` system was **not** implemented. Three topic-specific
concepts were designed instead — same identity as cover v2 (navy-900 ground,
electric-500 shapes with electric-400 outline, offset shadow at 0.22, no
text, decorative). Files in `docs/cover-proposals/` with rendered previews in
`docs/qa-shots/predeploy/proposal-*.png`:

1. **`concept-1-checklist.svg` — "shortlist, then verify."** Two checked
   boxes, one open box with an unfinished line. Best for: article 01
   (How to Choose an AI Writing Tool) and other decision/checklist pieces.
2. **`concept-2-source-shield.svg` — "one source in, verified out."** A
   source node feeding a shield with a check. Best for: article 05 (How to
   Verify AI News) and methodology/corrections content.
3. **`concept-3-workflow-loop.svg` — "a cycle that runs itself."** Three
   nodes in a return loop with arrowheads. Best for: article 03 (How to
   Automate Repetitive Work) and automation/agents content.

Path if approved: add a per-article `coverMotif` field, map each article to a
motif from a fixed vocabulary (these three plus a small set to complete the
six articles), generate covers per article instead of per category, keep
everything deterministic. No new dependencies.

## 5. Quality assurance

| Check | Result |
| --- | --- |
| `node tests/run.mjs` | **53/53** (routes, internal links + anchors, a11y basics, contrast, conditional SEO: no canonical/sitemap without `AIVOXFLOW_SITE_URL`, both branches tested, search index, JS <5 KB, CSS <40 KB budgets) |
| `node tests/responsive.mjs` | **31/31** (no h-overflow at 375/768/1280/1600 on 6 templates, skip link, mobile menu aria, search) |
| Font loading | 6/6 WOFF2 HTTP 200 from own origin; CDP confirms custom fonts render (§1) |
| Mobile responsiveness | §3: 375 px verified on 3 pages, no overflow |
| Accessibility | Skip-link + menu + labels covered by suites; footer keyboard order verified manually; tap targets now ≥44 px at mobile |
| Internal links | Suite: all resolve; footer link set unchanged (9 links) |
| SEO | Conditional canonical/OG/sitemap/robots logic green in both env branches (URL still unset locally by design) |
| Console errors | **0 messages** on home, article, tools (Chrome DevTools MCP) |
| Build | 25 routes, clean |

**Not rerun:** Lighthouse. Fonts add ~137 KB of first-party assets, so a
Lighthouse pass on the real free host (with real network + `AIVOXFLOW_SITE_URL`
set) is recommended as part of Gate A, not simulated locally.

## 6. Change manifest

| File | Change |
| --- | --- |
| `site/assets/fonts/*.woff2` (6) + `OFL-*.txt` (2) | new: self-hosted OFL fonts |
| `site/styles/site.css` | `@font-face` block; footer group styles; 44 px footer targets at mobile |
| `site/lib/html.mjs` | `FOOTER_GROUPS` (same 9 links, 3 labeled groups); font preloads + `serifPreload` |
| `site/build.mjs` | copy `assets/fonts` to dist; `serifPreload: true` for article + static pages |
| `docs/PRE_DEPLOYMENT_FINAL_CHECK.md` | this document |
| `docs/cover-proposals/concept-*.svg` (3) | proposal artifacts only |
| `docs/qa-shots/predeploy/*.png` (7) | 3 mobile + 1 desktop + 3 proposal renders |

## 7. Outstanding (unchanged from prior reviews)

- Gate A: free-host selection still blocks deployment (no deploy, DNS, or
  billing actions taken — none authorized).
- P2: Perplexity free-tier re-check when a JS-capable verification path is
  acceptable; remaining em-dash stylistic cleanup optional.
- Planned follow-ups: share-card PNG, `/es/` localization, CI, cover motif
  system (§4 pending approval).
