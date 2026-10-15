# Cover proposals — working folder

Status: **awaiting approval** (nothing here is wired into the site; site covers
are still the per-category v2 motifs).

## Final six (current proposal)

| File | Article | Reading |
| --- | --- | --- |
| `final-01-checklist-writing.svg` | 01 choose-an-ai-writing-tool | shortlist → verify (checklist + pencil) |
| `final-02-prompt-patterns.svg` | 02 prompt-patterns-that-work | structured prompt blocks + AI sparkle |
| `final-03-workflow-loop.svg` | 03 automate-repetitive-work | Input → Processing → Output cycle |
| `final-04-assistant-vs-traditional.svg` | 04 ai-assistants-vs-traditional-software | assistant bubble vs software grid |
| `final-05-news-verification.svg` | 05 how-to-verify-ai-news | two sources cross-referenced + lens (no checkmark) |
| `final-06-browser-vs-installed.svg` | 06 browser-based-vs-installed-ai-tools | browser window vs installed window |

Contact sheet: `contact-sheet.html` (renders card size 640×339 + 300 px
mobile previews) → screenshot at `docs/qa-shots/predeploy/cover-contact-sheet-final.png`.
Earlier iteration concepts (`concept-*.svg`, `final-*` v1 renders) kept for
history.

## Integration plan (only after approval)

1. Add motif functions to `site/lib/html.mjs` (one per motif, same token
   colors and 85% inset; keep the seeded rotation/scale from a slug hash).
2. Add `coverMotif` per article in `site/data/articles/*.json`.
3. Generate one SVG per article into `dist/assets/covers/<slug>.svg`;
   `articleCard()` points at the article cover (fallback: current category
   cover). Eager/lazy + decorative attributes unchanged.
4. Rebuild, run both suites, capture 375/1280 contact screenshots, commit.
