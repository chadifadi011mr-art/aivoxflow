# The free stack — no keys, no bills, no rate limits

You asked for free models that generate professional articles and images **without stopping**.
Short version: no key can be committed to this repository (it would be a secret leak and it would
stop working the moment someone rotates it), but there are two setups that cost nothing and never
hit a quota — and one of them needs no API key at all.

| Stack | Text | Images | Key needed | Limits |
| --- | --- | --- | --- | --- |
| **A. Local, unlimited** | Ollama | Stable Diffusion WebUI (A1111) | none | your hardware |
| **B. Local + free image API** | Ollama | Pollinations | none | Pollinations is best-effort |
| **C. Free tier** | Gemini API (AI Studio) | Gemini / Pollinations | yes, free | daily/minute quotas |

Stack **A** is the only one that literally never stops. Everything below is verified by
`tests/providers.mjs` (27 checks) against a stub that speaks each wire format.

---

## Stack A — fully local, unlimited, private

Nothing leaves your machine. No account, no key, no quota, no per-article cost.

### 1. Text: Ollama

```bash
# install: https://ollama.com/download  (Windows/macOS/Linux)
ollama serve                     # usually starts automatically
ollama pull qwen2.5:14b          # ~9 GB, good balance of quality and speed
# stronger, if you have the RAM/VRAM:
ollama pull qwen2.5:32b          # ~20 GB
ollama pull llama3.3:70b         # ~43 GB — needs ~48 GB unified memory
```

```bash
export AIVOXFLOW_AI_PROVIDER=ollama
export AIVOXFLOW_AI_MODEL=qwen2.5:14b
export AIVOXFLOW_AI_NUM_CTX=16384     # do not lower this
```

**Why `NUM_CTX` matters:** Ollama's default context is 2 048–4 096 tokens. A 2 000-word draft plus
its research pack does not fit, so the model silently truncates and the article loses its ending.
The adapter asks for 16 384 by default; keep it there or higher.

### 2. Images: Stable Diffusion WebUI

```bash
git clone https://github.com/AUTOMATIC1111/stable-diffusion-webui
cd stable-diffusion-webui
# Windows: edit webui-user.bat and add --api --listen to COMMANDLINE_ARGS
# then run it, and download an SDXL checkpoint in the WebUI
```

```bash
export AIVOXFLOW_IMAGE_PROVIDER=a1111
export AIVOXFLOW_IMAGE_BASE_URL=http://127.0.0.1:7860
export AIVOXFLOW_IMAGE_STEPS=28
export AIVOXFLOW_IMAGE_CFG=6.5
```

ComfyUI users can point `AIVOXFLOW_IMAGE_PROVIDER=a1111` at the A1111-compatible extension, or
keep `local` — see below.

### 3. Verify

```bash
node agents/doctor.mjs --probe
```

It lists the models Ollama actually has, checks the WebUI is reachable, then runs one text call and
one image end to end.

---

## Stack B — local text, free image API, no key

If you have no GPU, keep Ollama for text and use Pollinations for artwork. It needs no account and
no key.

```bash
export AIVOXFLOW_AI_PROVIDER=ollama
export AIVOXFLOW_AI_MODEL=qwen2.5:14b
export AIVOXFLOW_IMAGE_PROVIDER=pollinations
export AIVOXFLOW_IMAGE_MODEL=flux
```

Pollinations is a free public service: it is best-effort and may be slow or briefly unavailable.
The adapter retries four times, rejects placeholder images, and never caches a failure.

If even that is too unreliable, `AIVOXFLOW_IMAGE_PROVIDER=local` renders the six house motifs
locally with no network at all — free, instant, and consistent with the brand.

---

## Stack C — free tier keys

Free API tiers are genuinely useful for quality, but they throttle. They are **not** "without
stopping": expect 429s on a batch of articles, and the pipeline will wait and retry (it honours
`Retry-After`) rather than fail.

```bash
export AIVOXFLOW_AI_PROVIDER=gemini
export AIVOXFLOW_AI_MODEL=gemini-2.5-flash
export AIVOXFLOW_AI_API_KEY=...        # https://aistudio.google.com/apikey
export AIVOXFLOW_IMAGE_PROVIDER=pollinations   # or gemini, if your tier allows images
```

OpenRouter also has `:free` models:

```bash
export AIVOXFLOW_AI_PROVIDER=openrouter
export AIVOXFLOW_AI_MODEL=meta-llama/llama-3.3-70b-instruct:free
export AIVOXFLOW_AI_API_KEY=...
```

---

## Honest quality expectations

The gates do not care how famous a model is; they check the article. What actually happens:

| Model | Long-form quality | Will it pass the gates? |
| --- | --- | --- |
| 7–8B local (llama3.1:8b, qwen2.5:7b) | short, repetitive, weak sourcing | rarely — and that is correct |
| 14B local (qwen2.5:14b) | usable structure, thin analysis | sometimes, after human editing |
| 32B–70B local | close to a competent freelance writer | often |
| Gemini 2.5 Flash / GPT-4.1 class | publication-ready first draft | usually |

A small model that fails `structure` and `sourcing` is not a bug in the pipeline — it is the
pipeline telling you the truth before your readers do. If you want volume from a 7B model, lower
`MIN_WORDS` in `agents/lib/gates.mjs` and accept thinner articles; I would not.

## Research with no key at all

The research stage reads the web. There are three ways to feed it, cheapest first:

### 1. Hand-picked sources (no key, no quota) — implemented

```bash
# sources.txt — one https:// URL per line, # for comments
cat > sources.txt <<'EOF'
https://docs.ollama.com/
https://ai.google.dev/gemini-api/docs/pricing
https://www.anthropic.com/pricing
https://github.com/ollama/ollama/releases
EOF

node agents/run.mjs --topic "Choosing a local AI model for writing" \
  --category ai-tools --sources sources.txt
```

The agent fetches every page, measures what it actually read, and may only cite what came back.
Verified in this repo: five real pages were fetched and parsed before drafting.

This is the only research path with no account and no limit. You choose the sources — which is
also the fastest way to get an article that reflects *your* editorial judgement.

### 2. Brave Search API — free tier, key required

```bash
export AIVOXFLOW_SEARCH_PROVIDER=brave
export AIVOXFLOW_SEARCH_API_KEY=...
```

### 3. Tavily — free monthly credits, key required

```bash
export AIVOXFLOW_SEARCH_PROVIDER=tavily
export AIVOXFLOW_SEARCH_API_KEY=...
```

With `AIVOXFLOW_SEARCH_PROVIDER=none` and no `--sources`, the pipeline stops before writing and
tells you why. An article without sources is exactly the content farm `AGENTS.md` forbids.

## Security note

Never paste a key into a file in this repository, an issue, or a screenshot. Put it in `.env`
(already gitignored) or your shell, and check with `node agents/doctor.mjs` — it prints only
`abcd…xyz (39 chars)`, never the key itself.
