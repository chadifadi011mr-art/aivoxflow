# AIVOXFLOW content agents

Six specialist agents plus an orchestrator that turns a topic into a publishable article —
with research you can audit, artwork that matches the piece, and hard gates that reject
anything thin, unsourced or duplicated.

```bash
node agents/run.mjs --topic "How to choose an AI writing tool" --category ai-tools
```

Nothing is published by default. The pipeline stops at `scheduled` with a draft in
`content/drafts/`; `--publish` is a separate, deliberate step.

---

## The agents

| # | Agent | Job | Prompt |
| --- | --- | --- | --- |
| 01 | Research | Finds and **reads** primary sources, records contradictions, refuses to infer | [`prompts/01-research.md`](prompts/01-research.md) |
| 02 | Brief | Decides the reader, the decision, the angle and the word budget per section | [`prompts/02-brief.md`](prompts/02-brief.md) |
| 03 | Writer | Writes the long-form piece against the brief, citing inline | [`prompts/03-draft.md`](prompts/03-draft.md) |
| 04 | Fact-check | Extracts every checkable claim and maps it to a source; blocks on any gap | [`prompts/04-factcheck.md`](prompts/04-factcheck.md) |
| 05 | SEO / AI-discovery | Title, meta, slug, FAQ, `llms.txt` summary, internal links | [`prompts/05-seo.md`](prompts/05-seo.md) |
| 06 | Art direction | Commissions the hero and inline figures in the house style | [`prompts/06-image.md`](prompts/06-image.md) |
| — | QA | Runs the gates below on the finished artefact | [`lib/gates.mjs`](lib/gates.mjs) |

Prompts are Markdown files in this repo, versioned like code. Changing how the publication
thinks is a reviewable diff, not a hidden tweak.

## The state machine

```
idea → research → brief → draft → fact_check → seo_qa → image → editorial_qa → scheduled → published
                                                                        ↘ rejected / needs_human_review / failed
```

Illegal transitions throw. Every job records its id, idempotency key, timestamps, provider
and model, token usage, cost, retry count and a human-readable log in `content/jobs/<id>.json`.
The same topic cannot produce two live jobs without `--force`.

## Quality gates

A draft reaches `scheduled` only when **all** of these pass:

| Gate | Blocks when |
| --- | --- |
| `structure` | < 1 400 words, < 6 H2 sections, duplicate headings, > 2 paragraphs over 110 words |
| `sourcing` | < 4 distinct https sources, mock research, no claim ledger, any unverified claim, > 2 numeric sentences missing from the ledger |
| `originality` | duplicate title/description/slug, 5-gram overlap > 12% with an existing article, no `originalValue` statement |
| `seo` | title outside 45–65 chars, description outside 140–160, keyword missing from title or first 100 words, density > 2.5%, < 3 internal links |
| `ai_first` | no 35–75 word answer-first paragraph, takeaways not 3–5, FAQ < 3, no `llmsSummary` |
| `images` | no hero, alt outside 8–125 chars, missing dimensions, aspect ratio outside 1.4–1.9, > 3 figures |
| `honesty` | no disclosure, or "we tested" language without `tested: true` |

Run the pipeline and you will see the gates refuse mock output — that is the feature, not a bug.

## Images

Five providers, chosen with `AIVOXFLOW_IMAGE_PROVIDER`:

- **`local`** (default) — six hand-composed, category-specific motifs rendered at 1600×900 with
  the local browser (~60 KB JPEG each, no API, no stock photography, no cost, no network). It
  encodes the *shape* of the argument: a decision path for tutorials, a node graph for automation,
  two columns either side of an axis for comparisons.
- **`pollinations`** — free public API, no key, `flux` by default. Best-effort: retried, and
  placeholder images are rejected rather than shipped.
- **`a1111`** — a local Stable Diffusion WebUI (`--api`). Unlimited, private, no quota; needs a GPU.
- **`gemini`** — Google AI Studio. `imagen-*` goes through `:predict`; `gemini-*-image` goes
  through `:generateContent` with an image modality.
- **`openai`** — `/v1/images/generations` (1536×1024), prompt-following.

Either way the article ships with a real image, intrinsic `width`/`height` and descriptive alt
text, so the page never shifts and screen readers get the same information as everyone else.

Draft artwork is written to `content/drafts/assets/<slug>/` and only copied into
`site/assets-src/articles/<slug>/` when the article is promoted.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `AIVOXFLOW_AI_PROVIDER` | `mock` | `mock` · `ollama` · `gemini` · `openai` · `openai-compatible` · `anthropic` · `openrouter` |
| `AIVOXFLOW_AI_API_KEY` | — | Required except for `mock` and `ollama` |
| `AIVOXFLOW_AI_MODEL` | — | e.g. `qwen2.5:14b`, `gemini-2.5-flash`, `gpt-4.1` |
| `AIVOXFLOW_AI_BASE_URL` | provider default | Point at Ollama/vLLM for a local model |
| `AIVOXFLOW_AI_TIMEOUT_SECONDS` | `120` (`600` for Ollama) | Per request |
| `AIVOXFLOW_AI_MAX_RETRIES` | `4` | Transient errors only, exponential backoff + `Retry-After` |
| `AIVOXFLOW_AI_MAX_OUTPUT_TOKENS` | `8192` | Raise for very long drafts |
| `AIVOXFLOW_AI_NUM_CTX` | `16384` | Ollama context window — the default truncates long drafts |
| `AIVOXFLOW_AI_BUDGET_USD_DAILY` | `0` | `0` = no ceiling. Spend is tracked in `content/jobs/_ledger.json` |
| `AIVOXFLOW_AI_BUDGET_USD_MONTHLY` | `0` | Same, monthly |
| `AIVOXFLOW_AI_PRICE_INPUT_PER_1K` | `0` | For cost accounting |
| `AIVOXFLOW_AI_PRICE_OUTPUT_PER_1K` | `0` | For cost accounting |
| `AIVOXFLOW_SEARCH_PROVIDER` | `none` | `tavily` · `brave` |
| `AIVOXFLOW_SEARCH_API_KEY` | — | Optional for `tavily` (falls back to the free keyless mode); required for `brave` |
| `AIVOXFLOW_IMAGE_PROVIDER` | `local` | `local` · `pollinations` · `a1111` · `gemini` · `openai` |
| `AIVOXFLOW_IMAGE_API_KEY` | falls back to `AIVOXFLOW_AI_API_KEY` | Required for hosted providers |
| `AIVOXFLOW_IMAGE_MODEL` | `flux` / `gemini-2.5-flash-image` / `gpt-image-1` | Provider-specific |
| `AIVOXFLOW_BROWSER` | auto | Path to Edge/Chrome for local rendering |

**No key, no bill?** See [`docs/FREE_STACK.md`](../docs/FREE_STACK.md): Ollama for text and
Pollinations or a local Stable Diffusion for images run at zero cost with no quota at all.

A realistic run costs a few cents with a mid-tier hosted model. The budget ceilings exist so an
accidental loop cannot turn into a bill.

## Using Gemini

Two separate things share the name "Gemini":

- **Gemini Pro** (the app subscription) does **not** include API access.
- **The API** comes from [Google AI Studio](https://aistudio.google.com/apikey) as an API key, with
  its own free tier and its own quotas. Check the current limits on your account page before a
  batch run — image generation is the part most likely to be rate-limited or unavailable on a
  free tier.

```bash
# 1. see what your key can actually use
# (gemini-flash-latest tracks the newest stable Flash; older models such as
#  gemini-2.5-flash are no longer served to newly created keys)
AIVOXFLOW_AI_PROVIDER=gemini \
AIVOXFLOW_AI_MODEL=gemini-flash-latest \
AIVOXFLOW_AI_API_KEY=AQ.… \
node agents/doctor.mjs

# 2. same key for text and images
export AIVOXFLOW_AI_PROVIDER=gemini
export AIVOXFLOW_AI_MODEL=gemini-flash-latest
export AIVOXFLOW_AI_API_KEY=AQ.…
export AIVOXFLOW_IMAGE_PROVIDER=gemini
export AIVOXFLOW_IMAGE_MODEL=gemini-2.5-flash-image

node agents/doctor.mjs --probe        # one text call + one image, end to end
```

Image models are discovered, not assumed: `doctor` lists everything matching `image|imagen` and
tells you if the list is empty (which means the tier does not include image output).

The Gemini adapter sends the key in the `x-goog-api-key` header — never in the URL — so it cannot
leak into logs or error messages. If a model rejects `responseModalities` or `imageConfig`, the
adapter drops the unsupported field and retries instead of failing the run.

If you would rather not spend image quota, keep `AIVOXFLOW_IMAGE_PROVIDER=local`: the six house
motifs cost nothing and the article still ships with a real, dimensioned, alt-texted image.

## Commands

```bash
node agents/run.mjs --topic "…" --category ai-tools        # research → scheduled
node agents/run.mjs --topic "…" --category tutorials --notes "focus on pricing traps"
node agents/run.mjs --list                                  # every job and its state
node agents/run.mjs --resume job_20261017130726_90fcec      # continue an interrupted run
node agents/run.mjs --resolve job_… --decision "why the claim ledger is acceptable"
node agents/run.mjs --topic "…" --publish                   # promote a fully-gated draft
node agents/run.mjs --topic "…" --fixture agents/fixtures/demo-research.json   # offline demo
node agents/doctor.mjs [--probe]                            # check keys, list models, test one call

node agents/plan.mjs --slots 10        # fill the calendar from site/data/topics.json
node agents/scheduler.mjs --due        # what is ready to be written now
node agents/scheduler.mjs --once --build
node agents/scheduler.mjs --daemon --interval 30
```

`--slot <iso>` dates the article for its publication slot; the site build hides it until then.
See [`docs/SCHEDULING.md`](../docs/SCHEDULING.md).

Exit codes: `0` published/scheduled · `1` failed · `2` bad usage · `3` needs human review.

## When a job stops for human review

Exit `3` means a gate refused the piece and the job moved to `needs_human_review` —
a dead end for automation: `transition()` cannot leave it, `--resume` refuses it, and the
scheduler marks the calendar item `needs_review` instead of retrying.

To continue, after you have actually looked at the stop:

```bash
node agents/run.mjs --resolve job_20261018125109_6e334c \
  --decision "Accepted the applied corrections: invented pricing line cut, unverified base price removed."
```

`--resolve` prints the claim ledger (statuses plus the note behind each one), requires a
`--decision` of at least 10 characters, stamps that decision onto every claim the fact-checker
could not verify, records it in the job's audit log, and returns the job to the exact stage that
stopped — so the remaining gates (SEO, images, editorial QA) still run before anything can be
scheduled. Resolving is not publishing: `--publish` stays a separate, explicit act, and the
original verdict stays in the ledger as history.

## Offline demo

With no keys, run the fixture:

```bash
node agents/run.mjs --topic "How to choose an AI writing tool" --category ai-tools \
  --fixture agents/fixtures/demo-research.json
```

Every stage executes — including real image rendering — and the gates then reject the result
with six specific reasons. That is exactly what should happen to a scaffold, and it is the
fastest way to verify the machinery after a change.

## Adding a new category

1. Add the category to `site/data/categories.json`.
2. Add a motif to `MOTIFS` in [`lib/render-image.mjs`](lib/render-image.mjs) so its artwork is
   not a copy of another category.
3. Run the fixture pipeline once and check the hero.

## What these agents will not do

- Invent a source, a quote, a benchmark or a person.
- Publish without a human deciding to publish.
- Lower a gate to make a draft pass. If a piece cannot meet the bar, the correct output is
  `needs_human_review` — or no article at all.
