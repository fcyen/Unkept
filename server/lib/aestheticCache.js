/**
 * Shared pieces of the aesthetic score cache, dependency-free so both the
 * proxy (server/routes/aesthetic.js) and the demo-fixture generator
 * (client/scripts/build-demo-fixture.mjs) compute identical cache keys.
 *
 * The cache is content-addressed: key = sha256(model \0 prompt \0 imageData).
 * Including the model and prompt means a provider swap or prompt edit
 * naturally misses and re-scores. Values are `{ score, keep, reason }`.
 */
import { createHash } from 'node:crypto';

export const PROMPT = `Score a single photo for keep-worthiness in a personal year-in-review slideshow.
Consider: subject clarity, expressions (eyes open, faces visible), composition, lighting.
Penalize: motion blur, closed eyes, awkward crops, busy backgrounds.

Respond with ONLY strict JSON, no prose or fences:
{"score": <0..1>, "keep": <true|false>, "reason": <string, <=12 words>}`;

export function cacheKey(model, data, prompt = PROMPT) {
  return createHash('sha256')
    .update(model).update('\0')
    .update(prompt).update('\0')
    .update(data)
    .digest('hex');
}

/**
 * Resolve one photo against every model purely from a cache object — never
 * calls a provider. Misses come back as `{ model, error: { kind: 'not_cached' } }`
 * so callers can render an honest "no data" state instead of a silent null.
 *
 * @param {Record<string, {score:number, keep:boolean|null, reason:string}>} cache
 * @param {string[]} models
 * @param {{ id: string, data: string }} item
 */
export function lookupCached(cache, models, item) {
  return {
    id: item.id,
    models: models.map((model) => {
      const hit = cache[cacheKey(model, item.data)];
      return hit
        ? { model, ...hit, cached: true }
        : { model, score: null, keep: null, reason: '', error: { kind: 'not_cached' } };
    }),
  };
}

/**
 * Map a provider/SDK error to the small, UI-safe shape the client renders.
 * Never forwards headers, request bodies or anything key-shaped — only an
 * HTTP status, a coarse kind, and a short message.
 */
export function classifyProviderError(err) {
  const status = typeof err?.status === 'number' ? err.status : null;
  const retryAfterRaw = err?.headers?.['retry-after'] ?? err?.headers?.get?.('retry-after');
  const retryAfter = retryAfterRaw != null && !Number.isNaN(Number(retryAfterRaw))
    ? Number(retryAfterRaw)
    : null;
  if (status === 429) {
    return { kind: 'rate_limit', status, retryAfter, message: 'Provider rate limit (429)' };
  }
  const message = String(err?.message ?? 'Unknown error')
    // Belt-and-braces: never echo anything that looks like a key back to the UI.
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, 'sk-***')
    .slice(0, 120);
  return { kind: 'failed', status, retryAfter: null, message };
}

/**
 * Tiny counting semaphore. `limit(fn)` runs fn when fewer than `max` are in
 * flight. Used per provider so a burst of photos can't exceed the provider's
 * concurrency cap (Kimi rejects with 429 above a handful of parallel calls).
 */
export function createLimiter(max) {
  const cap = Math.max(1, Math.floor(max) || 1);
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= cap || queue.length === 0) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    Promise.resolve()
      .then(fn)
      .then(resolve, reject)
      .finally(() => { active--; next(); });
  };
  return (fn) => new Promise((resolve, reject) => {
    queue.push({ fn, resolve, reject });
    next();
  });
}
