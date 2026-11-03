import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { aestheticScoreStage, normaliseResult, errorFromBatchFailure } from './aestheticScore.js';

// Error / status / demo-mode behaviour of the aesthetic stage. Browser globals
// are stubbed the same way as aestheticScore.test.js.
function installBrowserGlobals() {
  globalThis.createImageBitmap = vi.fn(async () => ({ width: 1024, height: 768, close: () => {} }));
  globalThis.OffscreenCanvas = class {
    constructor(w, h) { this.width = w; this.height = h; }
    getContext() {
      return { drawImage: () => {}, getImageData: (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }) };
    }
    convertToBlob() {
      return Promise.resolve({ arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2, 3]).buffer) });
    }
  };
  if (!AbortSignal.timeout) AbortSignal.timeout = () => new AbortController().signal;
}
const photo = (id) => ({ id, name: `${id}.jpg`, file: new Blob(['x']) });
const json = (body, status = 200) => ({ ok: status < 300, status, json: async () => body });
const input = (clusters) => ({ clusters, burstGroups: [], burstCandidates: [] });

describe('aestheticScoreStage — states', () => {
  beforeEach(() => {
    installBrowserGlobals();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => { vi.restoreAllMocks(); delete globalThis.fetch; });

  it('demo mode makes no network calls at all', async () => {
    globalThis.fetch = vi.fn();
    const out = await aestheticScoreStage(input([[photo('a')]]), { demoMode: true });
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(out.aestheticStatus).toBe('demo');
    expect(out.clusters[0][0].aestheticScore).toBeNull();
  });

  it('reports unconfigured when the proxy health probe returns 503', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(json({ status: 'unconfigured' }, 503));
    const out = await aestheticScoreStage(input([[photo('a')]]), { demoMode: false });
    expect(out.aestheticStatus).toBe('unconfigured');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('reports unreachable when the probe throws', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const out = await aestheticScoreStage(input([[photo('a')]]), { demoMode: false });
    expect(out.aestheticStatus).toBe('unreachable');
  });

  it('sends candidates in batches and marks a 429 batch as rate-limited without losing the others', async () => {
    const posts = [];
    globalThis.fetch = vi.fn().mockImplementation((url, init) => {
      if (url.endsWith('/health')) return Promise.resolve(json({ status: 'ok' }));
      const ids = JSON.parse(init.body).photos.map((p) => p.id);
      posts.push(ids);
      if (posts.length === 2) return Promise.resolve(json({ error: 'rate limited' }, 429));
      return Promise.resolve(json({ scores: ids.map((id) => ({ id, models: [{ model: 'A', score: 0.7, keep: true, reason: 'ok' }] })) }));
    });
    // Three clusters of 2 → 6 candidates, batchSize 2 → 3 POSTs.
    const clusters = [[photo('a'), photo('b')], [photo('c'), photo('d')], [photo('e'), photo('f')]];
    const out = await aestheticScoreStage(input(clusters), { demoMode: false, batchSize: 2 });
    expect(posts).toEqual([['a', 'b'], ['c', 'd'], ['e', 'f']]);
    const byId = Object.fromEntries(out.clusters.flat().map((p) => [p.id, p]));
    expect(byId.a.aestheticScore).toBe(0.7);
    expect(byId.e.aestheticScore).toBe(0.7);
    expect(byId.c.aestheticScore).toBeNull();
    expect(byId.c.aestheticError).toMatchObject({ kind: 'rate_limit', status: 429 });
    expect(byId.d.aestheticError).toMatchObject({ kind: 'rate_limit' });
    expect(byId.a.aestheticError).toBeNull();
  });

  it('keeps a per-model error alongside the model that succeeded', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url.endsWith('/health')) return Promise.resolve(json({ status: 'ok' }));
      return Promise.resolve(json({ scores: [{ id: 'a', models: [
        { model: 'A', score: 0.9, keep: true, reason: 'crisp' },
        { model: 'B', score: null, keep: null, reason: '', error: { kind: 'rate_limit', status: 429 } },
      ] }] }));
    });
    const out = await aestheticScoreStage(input([[photo('a')]]), { demoMode: false });
    const p = out.clusters[0][0];
    expect(p.aestheticScore).toBe(0.9);
    expect(p.aestheticError).toBeNull(); // one model succeeded → photo isn't an error
    expect(p.aestheticModels[1].error.kind).toBe('rate_limit');
  });
});

describe('normaliseResult', () => {
  it('flags the photo when every model failed, preferring the first model error', () => {
    const r = normaliseResult({ id: 'a', models: [
      { model: 'A', score: null, error: { kind: 'failed', message: 'timeout' } },
      { model: 'B', score: null, error: { kind: 'rate_limit', status: 429 } },
    ] });
    expect(r.error).toEqual({ kind: 'failed', message: 'timeout' });
    expect(r.primary.model).toBe('A');
  });

  it('accepts the legacy flat shape', () => {
    const r = normaliseResult({ id: 'a', score: 0.5, keep: false, reason: 'meh' });
    expect(r.models).toEqual([{ model: null, score: 0.5, keep: false, reason: 'meh' }]);
    expect(r.error).toBeNull();
  });
});

describe('errorFromBatchFailure', () => {
  it('maps 429 to rate_limit and anything else to failed', () => {
    expect(errorFromBatchFailure({ status: 429 }).kind).toBe('rate_limit');
    expect(errorFromBatchFailure({ status: 500, message: 'x' })).toMatchObject({ kind: 'failed', status: 500 });
    expect(errorFromBatchFailure(new TypeError('net')).status).toBeNull();
  });
});
