import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { aestheticScoreStage } from './aestheticScore.js';

// Browser APIs the stage uses (createImageBitmap, OffscreenCanvas, fetch)
// need stubs under vitest's node environment.

function installBrowserGlobals() {
  globalThis.createImageBitmap = vi.fn(async () => ({
    width: 1024,
    height: 768,
    close: () => {},
  }));

  globalThis.OffscreenCanvas = class {
    constructor(w, h) {
      this.width = w;
      this.height = h;
    }
    getContext() {
      return {
        drawImage: () => {},
        // Synthetic pixel data; Laplacian variance only needs to return a
        // number, the test doesn't care about the relative ordering.
        getImageData: (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
      };
    }
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

describe('aestheticScoreStage', () => {
  beforeEach(() => {
    installBrowserGlobals();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    delete globalThis.createImageBitmap;
    delete globalThis.OffscreenCanvas;
    vi.restoreAllMocks();
  });

  it('attaches null aesthetic fields when the health probe fails', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const clusters = [[makePhoto('p1'), makePhoto('p2')]];

    const result = await aestheticScoreStage(
      { clusters, burstGroups: [], burstCandidates: [] },
    );

    expect(result.clusters[0][0].aestheticScore).toBeNull();
    expect(result.clusters[0][0].aestheticKeep).toBeNull();
    expect(result.clusters[0][0].aestheticReason).toBeNull();
    // Health probe is the only fetch — no POST attempted.
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch.mock.calls[0][0]).toContain('/health');
  });

  it('attaches score, keep and reason from the proxy response', async () => {
    const clusters = [[makePhoto('p1'), makePhoto('p2')]];

    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (typeof url === 'string' && url.endsWith('/health')) {
        return Promise.resolve(jsonResponse({ status: 'ok' }));
      }
      return Promise.resolve(
        jsonResponse({
          scores: [
            { id: 'p1', score: 0.82, keep: true, reason: 'sharp face, soft light' },
            { id: 'p2', score: 0.31, keep: false, reason: 'motion blur' },
          ],
        }),
      );
    });

    const result = await aestheticScoreStage(
      { clusters, burstGroups: [], burstCandidates: [] },
    );

    expect(result.clusters[0][0].aestheticScore).toBe(0.82);
    expect(result.clusters[0][0].aestheticKeep).toBe(true);
    expect(result.clusters[0][0].aestheticReason).toBe('sharp face, soft light');
    expect(result.clusters[0][1].aestheticScore).toBe(0.31);
    expect(result.clusters[0][1].aestheticKeep).toBe(false);
  });

  it('keeps aestheticScore null for photos missing from the response', async () => {
    const clusters = [[makePhoto('p1'), makePhoto('p2')]];

    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (typeof url === 'string' && url.endsWith('/health')) {
        return Promise.resolve(jsonResponse({ status: 'ok' }));
      }
      return Promise.resolve(
        jsonResponse({
          scores: [{ id: 'p1', score: 0.7, keep: true, reason: 'ok' }],
        }),
      );
    });

    const result = await aestheticScoreStage(
      { clusters, burstGroups: [], burstCandidates: [] },
    );

    expect(result.clusters[0][0].aestheticScore).toBe(0.7);
    expect(result.clusters[0][1].aestheticScore).toBeNull();
  });

  it('leaves all scores null when the POST batch returns 500', async () => {
    const clusters = [[makePhoto('p1')]];

    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (typeof url === 'string' && url.endsWith('/health')) {
        return Promise.resolve(jsonResponse({ status: 'ok' }));
      }
      return Promise.resolve({ ok: false, status: 500 });
    });

    const result = await aestheticScoreStage(
      { clusters, burstGroups: [], burstCandidates: [] },
    );

    expect(result.clusters[0][0].aestheticScore).toBeNull();
  });

  it('caps cluster candidates at topNPerCluster — large clusters are pre-filtered', async () => {
    // 5-photo cluster, topN=2 → only 2 ids should appear in the POST body.
    const clusters = [
      [
        makePhoto('p1'),
        makePhoto('p2'),
        makePhoto('p3'),
        makePhoto('p4'),
        makePhoto('p5'),
      ],
    ];

    let postedItems = null;
    globalThis.fetch = vi.fn().mockImplementation((url, init) => {
      if (typeof url === 'string' && url.endsWith('/health')) {
        return Promise.resolve(jsonResponse({ status: 'ok' }));
      }
      const body = JSON.parse(init.body);
      postedItems = body.photos;
      return Promise.resolve(
        jsonResponse({ scores: body.photos.map(({ id }) => ({ id, score: 0.5, keep: true, reason: 'ok' })) }),
      );
    });

    await aestheticScoreStage(
      { clusters, burstGroups: [], burstCandidates: [] },
      { topNPerCluster: 2 },
    );

    expect(postedItems).not.toBeNull();
    expect(postedItems.length).toBe(2);
  });

  it('returns early with no fetches when there are no clusters', async () => {
    globalThis.fetch = vi.fn();
    const result = await aestheticScoreStage(
      { clusters: [], burstGroups: [], burstCandidates: [] },
    );
    expect(result.clusters).toEqual([]);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
