# AIVOXFLOW — Brand Guide (Phase 0 / Brand Starter)

Status: brand starter complete. This guide consolidates
`AIVOXFLOW_BRAND_STARTER.md` into buildable, verified rules.
Nothing here hardcodes a domain or host — required by
`AIVOXFLOW_FREE_PHASE_REQUIREMENTS.md` rule 4.

## 1. Brand core

| Item | Value |
| --- | --- |
| Name | AIVOXFLOW |
| Target domain (not yet registered by us) | aivoxflow.com |
| Primary tagline | Intelligence in Motion. |
| Supporting line | Discover AI. Master Tools. Automate More. |
| Hero supporting copy | Discover AI tools, learn practical workflows, and make technology work for you. |
| Positioning | A global, practical technology and AI publication: discover tools, understand how they work, compare options, apply automation to real problems. |

## 2. Logo

Assets (all in `brand/`, all SVG, none embed a domain):

- `logo-icon.svg` — compact icon (badge style, works on light **and** dark).
- `favicon.svg` — same geometry as the icon.
- `logo-wordmark-light.svg` — horizontal lockup for light backgrounds.
- `logo-wordmark-dark.svg` — horizontal lockup for navy backgrounds.
- `icons/*.png` — rasterized sizes produced by `make-png-icons.ps1` (see §7).

Design rules:

- Motif: **connected signal / flow** — a rising line with electric-blue
  start/head nodes inside a deep-navy rounded badge. No robot heads, no
  circuit-board clichés, no heavy glow.
- The wordmark accent: **AIVO** + electric **X** + **FLOW**. The X is the
  visual hinge of the name and may appear alone in electric blue only as
  text/link accent — never as a standalone icon (an X alone reads as
  "close").
- Clearspace: keep at least half the badge height free on all sides.
- Minimum sizes: icon 16 px; wordmark 96 px wide (below that, use the icon).
- Backgrounds: use the dark-lockup on navy-900/navy-800; the light-lockup on
  white/gray-50. Never place the wordmark on mid-tone or busy photos.
- Production step (pending): convert wordmark text to outlines after the
  typeface is finalized, so the logo renders identically without fonts.
- Favicon test: verified in `brand/preview.html` at 128/64/32/24/16 px on
  light and dark panels.

## 3. Color palette (all ratios below were actually computed)

Verification method: `powershell -ExecutionPolicy Bypass -File docs\contrast-check.ps1`
(WCAG 2.1 relative-luminance formula).

| Token | Hex | Role | Key contrast |
| --- | --- | --- | --- |
| navy-950 | #050D22 | deepest surface | — |
| navy-900 | #08152F | primary background | white on it: 18.12:1 (AAA) |
| navy-800 | #0E2049 | dark cards | white on it: 15.89:1 (AAA) |
| navy-700 | #163064 | borders on dark | — |
| electric-600 | #0B57D0 | links/accent text on light | on white: 6.39:1 (AA) |
| electric-500 | #1E6BFF | primary buttons/fills | white label on it: 4.56:1 (AA) |
| electric-400 | #4C8DFF | links/accents **on navy** | on navy-900: 5.66:1 (AA) |
| white | #FFFFFF | base | — |
| gray-50 | #F6F8FB | subtle surface | — |
| gray-100 | #E9EDF4 | chips | — |
| gray-200 | #D6DCE7 | borders on light | — |
| gray-400 | #98A1B3 | muted text on dark | on navy-900: 6.98:1 (AA) |
| gray-600 | #59627A | secondary text on light | on white: 6.08:1 (AA) |
| gray-800 | #232A3B | strong text on light surfaces | on gray-100: 12.2:1 (AAA) |
| gray-900 | #111524 | body text | on white: 18.16:1 (AAA) |

**Verified design rule:** electric-500 on navy-900 is only **3.97:1 — fails
AA for text**. Therefore electric-500 is for fills/large elements; on dark
backgrounds use electric-400 for any text or links.

## 4. Typography

| Use | Latin (Phase /en/) | Arabic (later /ar/ phase) |
| --- | --- | --- |
| UI, headings | Inter (400/600/800) | Noto Sans Arabic |
| Article body (option) | Source Serif 4 | Noto Naskh Arabic |

- Both families are SIL Open Font License — free to self-host. Production
  must **self-host** the woff2 files (no third-party requests, free-hosting
  friendly, privacy-conscious).
- Declared in `tokens.css` as `--ax-font-sans` / `--ax-font-serif` with
  system fallbacks, so the site stays usable if fonts fail to load.
- Scale, line height (body 1.65), and tracking are tokens — do not invent
  ad-hoc sizes in templates.

## 5. Voice (from the brand starter)

- Clear, useful, specific, internationally understandable.
- Confident without exaggerated promises; no hype, no guaranteed results.
- Transparent about limitations, uncertainty, sponsorship, affiliate links,
  and whether a product was actually tested.
- Define technical terms and acronyms on first use.
- Evidence and practical examples over hype. Never fabricate metrics,
  reviews, testimonials, or author credentials.

## 6. Content taxonomy

1. AI Tools — 2. Tutorials — 3. Software & Web — 4. Automation & Agents —
5. AI News — 6. Comparisons

Launch scope: English first; Spanish and French after the editorial workflow
is consistent; German, Arabic, Portuguese later. Every language needs a
genuinely localized, crawlable URL and quality review.

## 7. How to review the brand locally

```
# Open the visual QA page (logo sizes, palette, type, focus states):
start brand\preview.html

# Re-verify all contrast claims:
powershell -ExecutionPolicy Bypass -File docs\contrast-check.ps1

# Regenerate PNG icons (uses local Edge headless; outputs brand/icons\):
powershell -ExecutionPolicy Bypass -File brand\make-png-icons.ps1
```

## 8. Checks to run before major spend (not legal advice)

- [ ] Trademark search for "AIVOXFLOW" and confusingly similar marks in the
      relevant jurisdictions and classes (registration ≠ clearance).
- [ ] Domain registration status confirmed by us (do not claim it is
      registered until it is).
- [ ] Final logo exported in required formats (outline text, PNG sizes,
      social sharing image) once the typeface is approved.

## 9. Phase-one deployment note

Phase one runs on free hosting and a free subdomain; the eventual custom
domain must stay configurable (`AIVOXFLOW_SITE_URL` in `.env.example`).
No brand asset, canonical URL, or content file may embed the temporary
domain. See `AIVOXFLOW_FREE_PHASE_REQUIREMENTS.md`.
