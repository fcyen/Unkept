import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { embeddingStage } from './embedding.js';

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
      return Promise.resolve({
        arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2, 3, 4]).buffer),
      });
    }
  };

  if (!AbortSignal.timeout) {
    AbortSignal.timeout = () => new AbortController().signal;
  }
}

function makePhoto(id) {
  return { id, name: `${id}.jpg`, file: new Blob(['fake-jpeg-bytes']) };
}

function jsonResponse(body, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

describe('embeddingStage', () => {
  beforeEach(() => {
    installBrowserGlobals();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    delete globalThis.createImageBitmap;
    delete globalThis.OffscreenCanvas;
    vi.restoreAllMocks();
  });

  it('marks all embeddings null when health check fails (server down)', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const photos = [makePhoto('p1'), makePhoto('p2')];

    const result = await embeddingStage({ photos, burstGroups: [], burstCandidates: [] });

    expect(result.photos[0].embedding).toBeNull();
    expect(result.photos[1].embedding).toBeNull();
    // No /embed POST attempted — health check is the only fetch.
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch.mock.calls[0][0]).toContain('/health');
  });

  it('marks photo embedding null when its id is absent from the response', async () => {
    const photos = [makePhoto('p1'), makePhoto('p2')];

    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (typeof url === 'string' && url.endsWith('/health')) {
        return Promise.resolve(jsonResponse({ status: 'ok' }));
      }
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
      return Promise.resolve({ ok: false, status: 500 });
    });

    const result = await embeddingStage({ photos, burstGroups: [], burstCandidates: [] });

    expect(result.photos[0].embedding).toBeNull();
  });
});
