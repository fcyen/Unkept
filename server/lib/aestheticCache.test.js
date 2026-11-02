import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROMPT, cacheKey, lookupCached, classifyProviderError, createLimiter } from './aestheticCache.js';

test('cacheKey is stable and sensitive to model, prompt and image', () => {
  const k = cacheKey('gpt-4o-mini', 'data:a');
  assert.equal(k, cacheKey('gpt-4o-mini', 'data:a'));
  assert.notEqual(k, cacheKey('kimi', 'data:a'));
  assert.notEqual(k, cacheKey('gpt-4o-mini', 'data:b'));
  assert.notEqual(k, cacheKey('gpt-4o-mini', 'data:a', PROMPT + ' '));
  assert.match(k, /^[0-9a-f]{64}$/);
});

test('lookupCached returns hits and marks misses as not_cached', () => {
  const cache = { [cacheKey('A', 'img')]: { score: 0.8, keep: true, reason: 'sharp' } };
  const out = lookupCached(cache, ['A', 'B'], { id: 'p1', data: 'img' });
  assert.equal(out.id, 'p1');
  assert.deepEqual(out.models[0], { model: 'A', score: 0.8, keep: true, reason: 'sharp', cached: true });
  assert.equal(out.models[1].model, 'B');
  assert.equal(out.models[1].score, null);
  assert.equal(out.models[1].error.kind, 'not_cached');
});

test('classifyProviderError maps 429 to rate_limit with retry-after', () => {
  const e = classifyProviderError({ status: 429, message: 'Too Many Requests', headers: { 'retry-after': '20' } });
  assert.deepEqual(e, { kind: 'rate_limit', status: 429, retryAfter: 20, message: 'Provider rate limit (429)' });
});

test('classifyProviderError redacts key-shaped strings and truncates', () => {
  const e = classifyProviderError({ status: 401, message: 'Incorrect API key provided: sk-FAKEtestKEY000000' });
  assert.equal(e.kind, 'failed');
  assert.equal(e.status, 401);
  assert.ok(!e.message.includes('FAKEtestKEY000000'));
  assert.ok(e.message.includes('sk-***'));
  assert.ok(classifyProviderError({ message: 'x'.repeat(500) }).message.length <= 120);
});

test('createLimiter never exceeds its cap and preserves results', async () => {
  const limit = createLimiter(2);
  let active = 0;
  let peak = 0;
  const results = await Promise.all(
    [1, 2, 3, 4, 5, 6].map((n) => limit(async () => {
      active++; peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return n * 10;
    })),
  );
  assert.equal(peak, 2);
  assert.deepEqual(results, [10, 20, 30, 40, 50, 60]);
});

test('createLimiter propagates rejections without stalling the queue', async () => {
  const limit = createLimiter(1);
  const failed = limit(async () => { throw new Error('boom'); });
  const ok = limit(async () => 'ok');
  await assert.rejects(failed, /boom/);
  assert.equal(await ok, 'ok');
});
