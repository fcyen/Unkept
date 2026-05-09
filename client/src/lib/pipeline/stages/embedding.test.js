import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { embeddingStage } from './embedding.js';

// ── DOM/global mocks ─────────────────────────────────────────────────────────
// Vitest runs in node, so the browser APIs the stage uses (createImageBitmap,
// OffscreenCanvas, fetch) need to be stubbed.

function installBrowserGlobals() {
  globalThis.createImageBitmap = vi.fn(async () => ({
    width: 1024,
    height: 768,
    close: () => {},
  }));

  globalThis.OffscreenCanvas = class {
    constructor(w, h) { this.width = w; this.height = h; }
    getContext() { return { drawImage: () => {} }; }
    convertToBlob() {
      // 4 fake JPEG bytes — content doesn't matter, only length.
      return Promise.resolve({
        arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2, 3, 4]).buffer),
      });
    }
  };

  // AbortSignal.timeout exists in Node 18+ but the embedding stage uses it
  // for the health check — keep it as is if available, polyfill otherwise.
  if (!AbortSignal.timeout) {
    AbortSignal.timeout = () => new AbortController().signal;
  }
}

function uninstallBrowserGlobals() {
  delete globalThis.createImageBitmap;
  delete globalThis.OffscreenCanvas;
}

function makePhoto(id) {
  return { id, name: `${id}.jpg`, file: new Blob(['fake-jpeg-bytes']) };
}

function jsonResponse(body, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
  };
}

describe('embeddingStage', () => {
  beforeEach(() => {
    installBrowserGlobals();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    uninstallBrowserGlobals();
    vi.restoreAllMocks();
  });

  it('returns input unchanged for empty photos', async () => {
    globalThis.fetch = vi.fn();
    const input = { photos: [], burstGroups: [], burstCandidates: [] };

    const result = await embeddingStage(input);

    expect(result).toBe(input);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('marks all embeddings null when health check fails (server down)', async () => {
    // /health rejects (fetch throws) — simulates connection refused.
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const photos = [makePhoto('p1'), makePhoto('p2')];
    const onProgress = vi.fn();

    const result = await embeddingStage(
      { photos, burstGroups: [], burstCandidates: [] },
      {},
      onProgress,
    );

    expect(result.photos[0].embedding).toBeNull();
    expect(result.photos[1].embedding).toBeNull();
    expect(console.warn).toHaveBeenCalled();
    // Health check called exactly once; no /embed POST attempted.
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch.mock.calls[0][0]).toContain('/health');
    expect(onProgress).toHaveBeenCalledWith(2, 2);
  });

  it('marks all embeddings null when /health returns non-ok', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    const photos = [makePhoto('p1')];

    const result = await embeddingStage({ photos, burstGroups: [], burstCandidates: [] });

    expect(result.photos[0].embedding).toBeNull();
  });

  it('attaches Float32Array embeddings on successful round-trip', async () => {
    const photos = [makePhoto('p1'), makePhoto('p2')];
    const fakeVector = Array.from({ length: 512 }, (_, i) => i / 512);

    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (typeof url === 'string' && url.endsWith('/health')) {
        return Promise.resolve(jsonResponse({ status: 'ok' }));
      }
      return Promise.resolve(jsonResponse({
        embeddings: [
          { id: 'p1', vector: fakeVector },
          { id: 'p2', vector: fakeVector },
        ],
      }));
    });

    const result = await embeddingStage({ photos, burstGroups: [], burstCandidates: [] });

    expect(result.photos[0].embedding).toBeInstanceOf(Float32Array);
    expect(result.photos[0].embedding).toHaveLength(512);
    expect(result.photos[1].embedding).toBeInstanceOf(Float32Array);
  });

  it('marks photo embedding null when its id is absent from the response', async () => {
    const photos = [makePhoto('p1'), makePhoto('p2')];

    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (typeof url === 'string' && url.endsWith('/health')) {
        return Promise.resolve(jsonResponse({ status: 'ok' }));
      }
      // Server only returned p1; p2 missing.
      return Promise.resolve(jsonResponse({
        embeddings: [{ id: 'p1', vector: [0.1, 0.2, 0.3] }],
      }));
    });

    const result = await embeddingStage({ photos, burstGroups: [], burstCandidates: [] });

    expect(result.photos[0].embedding).toBeInstanceOf(Float32Array);
    expect(result.photos[1].embedding).toBeNull();
  });

  it('continues when an /embed batch fails — those photos get null', async () => {
    const photos = [makePhoto('p1')];

    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (typeof url === 'string' && url.endsWith('/health')) {
        return Promise.resolve(jsonResponse({ status: 'ok' }));
      }
      // /embed call returns 500.
      return Promise.resolve({ ok: false, status: 500 });
    });

    const result = await embeddingStage({ photos, burstGroups: [], burstCandidates: [] });

    expect(result.photos[0].embedding).toBeNull();
    expect(console.warn).toHaveBeenCalled();
  });

  it('handles photos that fail to decode (createImageBitmap throws) by setting null', async () => {
    globalThis.createImageBitmap = vi.fn().mockRejectedValue(new Error('HEIC unsupported'));
    const photos = [makePhoto('p1')];

    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (typeof url === 'string' && url.endsWith('/health')) {
        return Promise.resolve(jsonResponse({ status: 'ok' }));
      }
      // /embed should be called with an empty list (decode failed) — but
      // even if it isn't, the photo should end up with null embedding.
      return Promise.resolve(jsonResponse({ embeddings: [] }));
    });

    const result = await embeddingStage({ photos, burstGroups: [], burstCandidates: [] });

    expect(result.photos[0].embedding).toBeNull();
  });

  it('passes burstGroups and burstCandidates through', async () => {
    const photos = [makePhoto('p1')];
    const burstGroups = [{ representativeId: 'p1', candidateIds: [] }];
    const burstCandidates = [makePhoto('p1_b')];

    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse({ status: 'ok' }));

    const input = { photos, burstGroups, burstCandidates };
    // Health check ok but /embed not stubbed-out specifically — make second call also return ok.
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (typeof url === 'string' && url.endsWith('/health')) {
        return Promise.resolve(jsonResponse({ status: 'ok' }));
      }
      return Promise.resolve(jsonResponse({
        embeddings: [{ id: 'p1', vector: [0.1] }],
      }));
    });

    const result = await embeddingStage(input);

    expect(result.burstGroups).toBe(burstGroups);
    expect(result.burstCandidates).toBe(burstCandidates);
  });
});
