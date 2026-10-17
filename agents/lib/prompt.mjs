// Prompt loader — the agent briefs live in agents/prompts/*.md and are versioned
// with the code, so a prompt change is a reviewable diff, not a hidden tweak.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const promptDir = path.join(here, '..', 'prompts');
const cache = new Map();

export function prompt(file) {
  if (!cache.has(file)) {
    cache.set(file, readFileSync(path.join(promptDir, file), 'utf8'));
  }
  return cache.get(file);
}

// Every stage sends its structured input inside <input>…</input> so the mock
// provider (and any future offline model) can parse it deterministically.
export const wrap = (obj) => `<input>\n${JSON.stringify(obj, null, 2)}\n</input>`;
