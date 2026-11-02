/**
 * Vision aesthetic/keeper scoring proxy.
 *
 * POST /api/aesthetic  { photos: [{ id, data }, ...] }
 *   → { scores: [{ id, models: [{ model, score, keep, reason }, ...] } | null, ...] }
 *
 * Each photo is scored against every configured provider in parallel, so the
 * `/pipeline` debug view can show a side-by-side comparison of two vision
 * models. A per-provider failure drops only that model's slot — the photo
 * still returns the models that succeeded.
 *
 * Provider-agnostic OpenAI-compatible clients. Provider A keeps the original
 * env vars (backward compatible); provider B is optional:
 *   LLM_BASE_URL    e.g. https://api.openai.com/v1   (provider A — primary)
 *   LLM_API_KEY     provider A API key
 *   LLM_MODEL       e.g. gpt-4o-mini
 *   LLM_BASE_URL_2  e.g. https://api.moonshot.ai/v1  (provider B — optional)
 *   LLM_API_KEY_2   provider B API key
 *   LLM_MODEL_2     e.g. moonshot-v1-8k-vision-preview
 *
 * Provider A's score is the one the pipeline (heroSelect) actually uses; the
 * second provider exists purely for the comparison overlay. With only A set,
 * behaviour is identical to the single-model proxy.
 *
 * Privacy: thumbnails only (data URL, ≤512px), never the original file.
 * Per-photo errors return null in their slot — the batch never 500s.
 *
 * The `openai` package is imported lazily so the server still boots if
 * it hasn't been installed yet.
 *
 * Caching: vision scores are deterministic for a given (model, prompt,
 * image), and the /pipeline dev loop re-scores the same sample images on
 * every run. Results are content-addressed and cached so a re-run is a
 * cache hit and never re-bills the LLM. The cache is persisted to
 * `server/.aesthetic-cache.json` (gitignored) so it survives restarts.
 */
import { Router } from 'express';
import { createHash } from 'node:crypto';
import { readFile, writeFile, rename, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const router = Router();

// Provider A's env trio is listed first so it stays the primary/authoritative
// model. Provider B is optional — absent vars are skipped silently.
const PROVIDER_ENVS = [
  { base: 'LLM_BASE_URL',   key: 'LLM_API_KEY',   model: 'LLM_MODEL' },
  { base: 'LLM_BASE_URL_2', key: 'LLM_API_KEY_2', model: 'LLM_MODEL_2' },
];

const PROMPT = `Score a single photo for keep-worthiness in a personal year-in-review slideshow.
Consider: subject clarity, expressions (eyes open, faces visible), composition, lighting.
Penalize: motion blur, closed eyes, awkward crops, busy backgrounds.

Respond with ONLY strict JSON, no prose or fences:
{"score": <0..1>, "keep": <true|false>, "reason": <string, <=12 words>}`;

// ── Content-addressed score cache ────────────────────────────────────────────
// Keyed by sha256(model + prompt + image data). Including the model and prompt
// means a provider swap or prompt edit naturally misses and re-scores. Only
// successful parses are cached, so transient errors get retried next run.
const CACHE_FILE = join(dirname(fileURLToPath(import.meta.url)), '..', '.aesthetic-cache.json');
const cache = new Map();
let cacheLoaded = false;
let saveTimer = null;

async function loadCache() {
  if (cacheLoaded) return;
  cacheLoaded = true;
  try {
    const obj = JSON.parse(await readFile(CACHE_FILE, 'utf8'));
    for (const [k, v] of Object.entries(obj)) cache.set(k, v);
    console.log(`[aesthetic] loaded ${cache.size} cached score(s) from ${CACHE_FILE}`);
  } catch {
    // No cache file yet (or unreadable) — start empty.
  }
}

// Debounced atomic write: coalesce a burst of new entries into one save, and
// write-then-rename so a crash mid-write can't corrupt the file.
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    try {
      const tmp = `${CACHE_FILE}.tmp`;
      await writeFile(tmp, JSON.stringify(Object.fromEntries(cache)));
      await rename(tmp, CACHE_FILE);
    } catch (err) {
      console.warn('[aesthetic] cache save failed:', err.message);
    }
  }, 1000);
  if (saveTimer.unref) saveTimer.unref();
}

function cacheKey(model, data) {
  return createHash('sha256')
    .update(model).update('\0')
    .update(PROMPT).update('\0')
    .update(data)
    .digest('hex');
}

// undefined = not initialised; otherwise an array (possibly empty) of
// { client, model } in priority order — index 0 is the primary provider.
let providers;

async function getProviders() {
  if (providers !== undefined) return providers;
  providers = [];
  let OpenAI;
  for (const env of PROVIDER_ENVS) {
    const baseURL = process.env[env.base];
    const apiKey = process.env[env.key];
    const modelName = process.env[env.model];
    if (!baseURL || !apiKey || !modelName) continue;
    if (!OpenAI) {
      try {
        ({ default: OpenAI } = await import('openai'));
      } catch {
        console.warn('[aesthetic] `openai` package not installed — run `npm install` in server/.');
        providers = [];
        return providers;
      }
    }
    providers.push({ client: new OpenAI({ baseURL, apiKey }), model: modelName });
  }
  if (providers.length === 0) {
    console.warn('[aesthetic] no provider configured (LLM_BASE_URL / LLM_API_KEY / LLM_MODEL) — proxy disabled.');
  }
  return providers;
}

function parseScore(content) {
  if (!content) return null;
  // Some models still wrap JSON in ```json fences despite the prompt.
  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  const score = typeof parsed.score === 'number' ? Math.max(0, Math.min(1, parsed.score)) : null;
  if (score == null) return null;
  const keep = typeof parsed.keep === 'boolean' ? parsed.keep : null;
  const reason = typeof parsed.reason === 'string' ? parsed.reason.slice(0, 80) : '';
  return { score, keep, reason };
}

async function scoreWithProvider(provider, item) {
  const key = cacheKey(provider.model, item.data);
  const hit = cache.get(key);
  if (hit) return { model: provider.model, ...hit, cached: true };

  try {
    const response = await provider.client.chat.completions.create({
      model: provider.model,
      max_tokens: 80,
      temperature: 0,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: PROMPT },
            { type: 'image_url', image_url: { url: item.data } },
          ],
        },
      ],
    });
    const parsed = parseScore(response.choices?.[0]?.message?.content);
    if (!parsed) return null;
    cache.set(key, parsed);
    scheduleSave();
    return { model: provider.model, ...parsed };
  } catch (err) {
    console.warn('[aesthetic] score failed for', item.id, 'on', provider.model, '-', err.message);
    return null;
  }
}

router.get('/health', async (_req, res) => {
  const provs = await getProviders();
  if (provs.length === 0) return res.status(503).json({ status: 'unconfigured', models: [] });
  await loadCache();
  res.json({ status: 'ok', models: provs.map((p) => p.model), cached: cache.size });
});

// Clear the score cache — both in memory and the persisted file. Used by the
// /pipeline "Clear cache" button to force a fresh re-score on the next run.
router.delete('/cache', async (_req, res) => {
  cache.clear();
  cacheLoaded = true; // stay "loaded" — the cache is now intentionally empty
  // Cancel any debounced save so it can't rewrite the file after deletion.
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  try {
    await rm(CACHE_FILE, { force: true });
  } catch (err) {
    console.warn('[aesthetic] cache file removal failed:', err.message);
  }
  res.json({ status: 'ok', cached: 0 });
});

router.post('/', async (req, res) => {
  const provs = await getProviders();
  if (provs.length === 0) {
    return res.status(503).json({ error: 'aesthetic proxy unconfigured' });
  }
  await loadCache();
  const { photos } = req.body ?? {};
  if (!Array.isArray(photos)) {
    return res.status(400).json({ error: 'expected { photos: [{ id, data }, ...] }' });
  }
  const scores = await Promise.all(
    photos.map(async (item) => {
      const results = await Promise.all(provs.map((p) => scoreWithProvider(p, item)));
      const models = results.filter(Boolean);
      // Drop the photo entirely only if every provider failed; otherwise
      // return whichever models succeeded so the comparison can still render.
      if (models.length === 0) return null;
      return { id: item.id, models };
    }),
  );
  res.json({ scores });
});

export default router;
