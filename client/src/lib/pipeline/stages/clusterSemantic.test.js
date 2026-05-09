import { describe, it, expect, vi } from 'vitest';
import { clusterSemanticStage } from './clusterSemantic.js';

function unit(v) {
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return new Float32Array(v.map((x) => x / (n || 1)));
}

function makePhoto(id, timestamp, embedding) {
  return { id, name: `${id}.jpg`, timestamp, embedding, coords: null, file: null };
}

describe('clusterSemanticStage', () => {
  it('falls back to single cluster when no photos have embeddings', async () => {
    const photos = [
      makePhoto('p1', '2025-03-15T08:00:00Z', null),
      makePhoto('p2', '2025-03-16T09:00:00Z', null),
    ];
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await clusterSemanticStage({ photos, burstGroups: [], burstCandidates: [] });

    expect(result.clusters).toHaveLength(1);
    expect(result.clusters[0]).toHaveLength(2);
  });

  // Smoke test for the k-means path itself — not a correctness check on the
  // algorithm, just verification that we actually run it and bin photos by
  // its output. With four orthogonal unit vectors and k=2, any reasonable
  // k-means implementation will produce two non-empty buckets; if kmeans()
  // were silently broken (e.g. always returning 0), this test would fail
  // because only one cluster would end up populated.
  it('runs k-means and produces k buckets when embeddings differ', async () => {
    const photos = [
      makePhoto('a1', '2025-03-15T08:00:00Z', unit([1, 0, 0, 0])),
      makePhoto('a2', '2025-03-15T09:00:00Z', unit([1, 0, 0, 0])),
      makePhoto('b1', '2025-03-15T10:00:00Z', unit([0, 1, 0, 0])),
      makePhoto('b2', '2025-03-15T11:00:00Z', unit([0, 1, 0, 0])),
    ];

    const result = await clusterSemanticStage(
      { photos, burstGroups: [], burstCandidates: [] },
      { k: 2 },
    );

    expect(result.clusters).toHaveLength(2);
    const total = result.clusters.reduce((s, c) => s + c.length, 0);
    expect(total).toBe(4);
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
    const trailing = result.clusters[result.clusters.length - 1];
    expect(trailing.map((p) => p.id).sort()).toEqual(['u1', 'u2']);
  });
});
