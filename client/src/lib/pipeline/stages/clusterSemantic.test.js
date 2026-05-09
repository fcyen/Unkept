import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { clusterSemanticStage } from './clusterSemantic.js';

// L2-normalised 4-d "embedding" stand-ins. Real CLIP vectors are 512-d, but
// the algorithm doesn't care about dimensionality — only that vectors are
// unit-length (so dot product == cosine similarity).
function unit(v) {
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return new Float32Array(v.map((x) => x / (n || 1)));
}

function makePhoto(id, timestamp, embedding) {
  return { id, name: `${id}.jpg`, timestamp, embedding, coords: null, file: null };
}

describe('clusterSemanticStage', () => {
  // Deterministic Math.random — k-means++ init samples from it.
  // A monotonic sequence makes the seed-picking reproducible across runs.
  let randomSpy;
  let counter;
  beforeEach(() => {
    counter = 0;
    randomSpy = vi.spyOn(Math, 'random').mockImplementation(() => {
      // Pseudo-deterministic but non-degenerate sequence in (0,1).
      counter = (counter + 0.37) % 1;
      return counter;
    });
  });
  afterEach(() => {
    randomSpy.mockRestore();
  });

  it('returns empty result for empty input', async () => {
    const result = await clusterSemanticStage({ photos: [], burstGroups: [], burstCandidates: [] });
    expect(result).toEqual({ clusters: [], burstGroups: [], burstCandidates: [] });
  });

  it('falls back to single cluster when no photos have embeddings', async () => {
    const photos = [
      makePhoto('p1', '2025-03-15T08:00:00Z', null),
      makePhoto('p2', '2025-03-16T09:00:00Z', null),
    ];
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await clusterSemanticStage({ photos, burstGroups: [], burstCandidates: [] });

    expect(result.clusters).toHaveLength(1);
    expect(result.clusters[0]).toHaveLength(2);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('separates two clearly opposite vector groups into distinct clusters', async () => {
    // 4 "beach" photos pointing along +x, 4 "city" photos along +y — orthogonal.
    const beach = [
      makePhoto('b1', '2025-03-15T08:00:00Z', unit([1, 0, 0, 0])),
      makePhoto('b2', '2025-03-15T09:00:00Z', unit([0.95, 0.05, 0, 0])),
      makePhoto('b3', '2025-03-15T10:00:00Z', unit([0.9, 0.1, 0, 0])),
      makePhoto('b4', '2025-03-15T11:00:00Z', unit([0.98, 0, 0.02, 0])),
    ];
    const city = [
      makePhoto('c1', '2025-04-01T08:00:00Z', unit([0, 1, 0, 0])),
      makePhoto('c2', '2025-04-01T09:00:00Z', unit([0.05, 0.95, 0, 0])),
      makePhoto('c3', '2025-04-01T10:00:00Z', unit([0, 0.9, 0.1, 0])),
      makePhoto('c4', '2025-04-01T11:00:00Z', unit([0, 0.98, 0, 0.02])),
    ];
    const photos = [...beach, ...city];

    const result = await clusterSemanticStage(
      { photos, burstGroups: [], burstCandidates: [] },
      { k: 2 },
    );

    expect(result.clusters).toHaveLength(2);

    // Each cluster should contain only beach OR only city photos.
    for (const cluster of result.clusters) {
      const ids = cluster.map((p) => p.id);
      const allBeach = ids.every((id) => id.startsWith('b'));
      const allCity = ids.every((id) => id.startsWith('c'));
      expect(allBeach || allCity).toBe(true);
    }
  });

  it('sorts photos within each cluster by timestamp ascending', async () => {
    const photos = [
      makePhoto('p3', '2025-03-15T18:00:00Z', unit([1, 0])),
      makePhoto('p1', '2025-03-15T08:00:00Z', unit([1, 0])),
      makePhoto('p2', '2025-03-15T12:00:00Z', unit([1, 0])),
    ];

    const result = await clusterSemanticStage(
      { photos, burstGroups: [], burstCandidates: [] },
      { k: 1 },
    );

    expect(result.clusters).toHaveLength(1);
    expect(result.clusters[0].map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
  });

  it('sorts clusters by their earliest photo timestamp', async () => {
    // Two cleanly separable clusters; the "later" group comes first in input.
    const photos = [
      makePhoto('late1',  '2025-06-01T08:00:00Z', unit([0, 1])),
      makePhoto('late2',  '2025-06-01T09:00:00Z', unit([0, 1])),
      makePhoto('early1', '2025-03-01T08:00:00Z', unit([1, 0])),
      makePhoto('early2', '2025-03-01T09:00:00Z', unit([1, 0])),
    ];

    const result = await clusterSemanticStage(
      { photos, burstGroups: [], burstCandidates: [] },
      { k: 2 },
    );

    expect(result.clusters).toHaveLength(2);
    // First cluster's earliest timestamp must precede second cluster's.
    const t0 = new Date(result.clusters[0][0].timestamp).getTime();
    const t1 = new Date(result.clusters[1][0].timestamp).getTime();
    expect(t0).toBeLessThan(t1);
  });

  it('appends unembedded photos as a trailing cluster', async () => {
    const photos = [
      makePhoto('e1', '2025-03-15T08:00:00Z', unit([1, 0])),
      makePhoto('e2', '2025-03-15T09:00:00Z', unit([1, 0])),
      makePhoto('u1', '2025-03-15T10:00:00Z', null),
      makePhoto('u2', '2025-03-15T11:00:00Z', null),
    ];

    const result = await clusterSemanticStage(
      { photos, burstGroups: [], burstCandidates: [] },
      { k: 1 },
    );

    expect(result.clusters).toHaveLength(2);
    // Last cluster is the unembedded ones.
    const trailing = result.clusters[result.clusters.length - 1];
    expect(trailing.map((p) => p.id).sort()).toEqual(['u1', 'u2']);
  });

  it('passes burstGroups and burstCandidates through unchanged', async () => {
    const burstGroups = [{ representativeId: 'p1', candidateIds: ['p1_b'] }];
    const burstCandidates = [makePhoto('p1_b', '2025-03-15T08:00:01Z', null)];
    const photos = [makePhoto('p1', '2025-03-15T08:00:00Z', unit([1, 0]))];

    const result = await clusterSemanticStage(
      { photos, burstGroups, burstCandidates },
      { k: 1 },
    );

    expect(result.burstGroups).toBe(burstGroups);
    expect(result.burstCandidates).toBe(burstCandidates);
  });

  it('respects custom k option', async () => {
    // 6 distinct unit directions — with k=3 we expect at most 3 clusters.
    const photos = Array.from({ length: 6 }, (_, i) => {
      const angle = (i / 6) * 2 * Math.PI;
      return makePhoto(
        `p${i}`,
        `2025-03-${String(15 + i).padStart(2, '0')}T08:00:00Z`,
        unit([Math.cos(angle), Math.sin(angle)]),
      );
    });

    const result = await clusterSemanticStage(
      { photos, burstGroups: [], burstCandidates: [] },
      { k: 3 },
    );

    expect(result.clusters.length).toBeLessThanOrEqual(3);
    // All photos still accounted for.
    const total = result.clusters.reduce((s, c) => s + c.length, 0);
    expect(total).toBe(6);
  });

  it('reports progress as complete', async () => {
    const photos = [makePhoto('p1', '2025-03-15T08:00:00Z', unit([1, 0]))];
    const onProgress = vi.fn();

    await clusterSemanticStage({ photos, burstGroups: [], burstCandidates: [] }, {}, onProgress);

    expect(onProgress).toHaveBeenCalledWith(1, 1);
  });

  it('handles n <= k by giving each photo its own cluster', async () => {
    const photos = [
      makePhoto('p1', '2025-03-15T08:00:00Z', unit([1, 0])),
      makePhoto('p2', '2025-03-15T09:00:00Z', unit([0, 1])),
    ];

    // k=5 but only 2 photos — kmeans branches to "one cluster per photo".
    const result = await clusterSemanticStage(
      { photos, burstGroups: [], burstCandidates: [] },
      { k: 5 },
    );

    // Two clusters, one photo each. (Empty cluster slots are dropped.)
    const total = result.clusters.reduce((s, c) => s + c.length, 0);
    expect(total).toBe(2);
    for (const c of result.clusters) expect(c).toHaveLength(1);
  });
});
