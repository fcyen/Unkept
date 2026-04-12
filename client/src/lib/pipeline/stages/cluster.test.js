import { describe, it, expect } from 'vitest';
import { clusterByDay, clusterByTimeGap } from './cluster.js';

function makePhoto(id, timestamp, coords = null) {
  return { id, name: `${id}.jpg`, timestamp, coords, file: null };
}

describe('clusterByDay', () => {
  it('groups photos by calendar date', () => {
    const photos = [
      makePhoto('p1', '2025-03-15T08:00:00Z'),
      makePhoto('p2', '2025-03-15T14:00:00Z'),
      makePhoto('p3', '2025-03-16T09:00:00Z'),
      makePhoto('p4', '2025-03-16T18:00:00Z'),
      makePhoto('p5', '2025-03-17T10:00:00Z'),
    ];

    const clusters = clusterByDay(photos);

    expect(clusters).toHaveLength(3);
    expect(clusters[0].map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(clusters[1].map((p) => p.id)).toEqual(['p3', 'p4']);
    expect(clusters[2].map((p) => p.id)).toEqual(['p5']);
  });

  it('puts photos without timestamps in an undated group', () => {
    const photos = [
      makePhoto('p1', '2025-03-15T08:00:00Z'),
      makePhoto('p2', null),
      makePhoto('p3', null),
    ];

    const clusters = clusterByDay(photos);

    expect(clusters).toHaveLength(2);
    expect(clusters[0].map((p) => p.id)).toEqual(['p1']);
    expect(clusters[1].map((p) => p.id)).toEqual(['p2', 'p3']);
  });

  it('handles all photos without timestamps', () => {
    const photos = [
      makePhoto('p1', null),
      makePhoto('p2', null),
    ];

    const clusters = clusterByDay(photos);

    expect(clusters).toHaveLength(1);
    expect(clusters[0].map((p) => p.id)).toEqual(['p1', 'p2']);
  });

  it('single-photo day forms its own cluster', () => {
    const photos = [
      makePhoto('p1', '2025-03-15T08:00:00Z'),
      makePhoto('p2', '2025-03-16T08:00:00Z'),
      makePhoto('p3', '2025-03-17T08:00:00Z'),
    ];

    const clusters = clusterByDay(photos);

    expect(clusters).toHaveLength(3);
    expect(clusters[0]).toHaveLength(1);
    expect(clusters[1]).toHaveLength(1);
    expect(clusters[2]).toHaveLength(1);
  });

  it('produces same output regardless of input order', () => {
    const photos = [
      makePhoto('p3', '2025-03-17T10:00:00Z'),
      makePhoto('p1', '2025-03-15T08:00:00Z'),
      makePhoto('p2', '2025-03-16T09:00:00Z'),
    ];

    const clusters = clusterByDay(photos);

    // Should be sorted by date regardless of input order
    expect(clusters[0][0].id).toBe('p1');
    expect(clusters[1][0].id).toBe('p2');
    expect(clusters[2][0].id).toBe('p3');
  });

  it('returns empty array for empty input', () => {
    const clusters = clusterByDay([]);
    expect(clusters).toEqual([]);
  });

  it('sorts photos within each day by timestamp', () => {
    const photos = [
      makePhoto('p3', '2025-03-15T18:00:00Z'),
      makePhoto('p1', '2025-03-15T08:00:00Z'),
      makePhoto('p2', '2025-03-15T12:00:00Z'),
    ];

    const clusters = clusterByDay(photos);

    expect(clusters).toHaveLength(1);
    expect(clusters[0].map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
  });
});

describe('clusterByTimeGap', () => {
  it('splits photos when time gap exceeds threshold', () => {
    const photos = [
      makePhoto('p1', '2025-03-15T08:00:00Z'),
      makePhoto('p2', '2025-03-15T08:10:00Z'),
      // 2-hour gap
      makePhoto('p3', '2025-03-15T10:10:00Z'),
      makePhoto('p4', '2025-03-15T10:20:00Z'),
    ];

    const clusters = clusterByTimeGap(photos, 45 * 60 * 1000);

    expect(clusters).toHaveLength(2);
    expect(clusters[0].map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(clusters[1].map((p) => p.id)).toEqual(['p3', 'p4']);
  });

  it('keeps photos in one cluster when gap is within threshold', () => {
    const photos = [
      makePhoto('p1', '2025-03-15T08:00:00Z'),
      makePhoto('p2', '2025-03-15T08:30:00Z'),
      makePhoto('p3', '2025-03-15T09:00:00Z'),
    ];

    const clusters = clusterByTimeGap(photos, 45 * 60 * 1000);

    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toHaveLength(3);
  });

  it('handles unsorted input correctly', () => {
    const photos = [
      makePhoto('p3', '2025-03-15T10:10:00Z'),
      makePhoto('p1', '2025-03-15T08:00:00Z'),
      makePhoto('p2', '2025-03-15T08:10:00Z'),
    ];

    const clusters = clusterByTimeGap(photos, 45 * 60 * 1000);

    // Should still produce correct grouping
    expect(clusters).toHaveLength(2);
    expect(clusters[0].map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(clusters[1].map((p) => p.id)).toEqual(['p3']);
  });

  it('puts photos without timestamps in undated group', () => {
    const photos = [
      makePhoto('p1', '2025-03-15T08:00:00Z'),
      makePhoto('p2', null),
    ];

    const clusters = clusterByTimeGap(photos, 45 * 60 * 1000);

    expect(clusters).toHaveLength(2);
    expect(clusters[0][0].id).toBe('p1');
    expect(clusters[1][0].id).toBe('p2');
  });

  it('returns empty for empty input', () => {
    const clusters = clusterByTimeGap([], 45 * 60 * 1000);
    expect(clusters).toEqual([]);
  });

  it('respects custom gap threshold', () => {
    const photos = [
      makePhoto('p1', '2025-03-15T08:00:00Z'),
      // 20 minute gap
      makePhoto('p2', '2025-03-15T08:20:00Z'),
    ];

    // With 15-minute threshold, should split
    const clusters15 = clusterByTimeGap(photos, 15 * 60 * 1000);
    expect(clusters15).toHaveLength(2);

    // With 30-minute threshold, should stay together
    const clusters30 = clusterByTimeGap(photos, 30 * 60 * 1000);
    expect(clusters30).toHaveLength(1);
  });
});
