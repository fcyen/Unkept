import { describe, it, expect } from 'vitest';
import { allocateTargets, pickTopK } from './CurationScreen.jsx';

// Helper: chapters are just { id, photoIds } for allocation purposes.
function chapter(id, count) {
  return { id, photoIds: Array.from({ length: count }, (_, i) => `${id}-${i}`) };
}

describe('allocateTargets', () => {
  it('sums to exactly targetCount', () => {
    const chapters = [chapter('a', 10), chapter('b', 6), chapter('c', 4)];
    const alloc = allocateTargets(chapters, 20, 7);
    const sum = [...alloc.values()].reduce((s, n) => s + n, 0);
    expect(sum).toBe(7);
  });

  it('splits proportionally via largest remainder', () => {
    // 10/6/4 of 20 photos, target 10 → exact quotas 5/3/2, no remainder drift.
    const chapters = [chapter('a', 10), chapter('b', 6), chapter('c', 4)];
    const alloc = allocateTargets(chapters, 20, 10);
    expect(alloc.get('a')).toBe(5);
    expect(alloc.get('b')).toBe(3);
    expect(alloc.get('c')).toBe(2);
  });

  it('hands leftover slots to the largest fractional remainders', () => {
    // Three equal chapters, target 5 → quotas 1.66 each; floors give 1/1/1,
    // two leftover slots go to two chapters → still sums to 5.
    const chapters = [chapter('a', 3), chapter('b', 3), chapter('c', 3)];
    const alloc = allocateTargets(chapters, 9, 5);
    const sum = [...alloc.values()].reduce((s, n) => s + n, 0);
    expect(sum).toBe(5);
    // Each chapter gets at least its floor, none exceeds its cap.
    expect([...alloc.values()].every((n) => n >= 1 && n <= 3)).toBe(true);
  });

  it('allows a chapter to get 0 when targetCount < chapter count (exact-total policy)', () => {
    const chapters = [chapter('a', 18), chapter('b', 1), chapter('c', 1)];
    const alloc = allocateTargets(chapters, 20, 2);
    const sum = [...alloc.values()].reduce((s, n) => s + n, 0);
    expect(sum).toBe(2);
    // The big chapter dominates the proportional split; small chapters may be 0.
    expect(alloc.get('a')).toBeGreaterThan(0);
  });

  it('never allocates more than a chapter holds (cap respected, multi-pass)', () => {
    // Target exceeds what the small chapters can absorb; leftover must flow to
    // the chapter with capacity rather than overfilling.
    const chapters = [chapter('a', 8), chapter('b', 1), chapter('c', 1)];
    const alloc = allocateTargets(chapters, 10, 6);
    expect(alloc.get('a')).toBeLessThanOrEqual(8);
    expect(alloc.get('b')).toBeLessThanOrEqual(1);
    expect(alloc.get('c')).toBeLessThanOrEqual(1);
    const sum = [...alloc.values()].reduce((s, n) => s + n, 0);
    expect(sum).toBe(6);
  });

  it('caps total at totalPhotos when targetCount exceeds it', () => {
    const chapters = [chapter('a', 3), chapter('b', 2)];
    const alloc = allocateTargets(chapters, 5, 100);
    const sum = [...alloc.values()].reduce((s, n) => s + n, 0);
    expect(sum).toBe(5); // every photo, no more
  });

  it('returns all zeros for targetCount 0', () => {
    const chapters = [chapter('a', 3), chapter('b', 2)];
    const alloc = allocateTargets(chapters, 5, 0);
    expect([...alloc.values()].every((n) => n === 0)).toBe(true);
  });
});

describe('pickTopK', () => {
  const photosMap = {
    hero: { id: 'hero', aestheticScore: null, qualityScore: 0.1 },
    p1: { id: 'p1', aestheticScore: null, qualityScore: 0.9 },
    p2: { id: 'p2', aestheticScore: null, qualityScore: 0.5 },
    p3: { id: 'p3', aestheticScore: null, qualityScore: 0.3 },
  };
  const ids = ['hero', 'p1', 'p2', 'p3'];

  it('puts the hero first even when it scores lowest', () => {
    const picks = pickTopK(ids, photosMap, 'hero', 3);
    expect(picks[0]).toBe('hero');
  });

  it('fills remaining slots by quality score, highest first', () => {
    const picks = pickTopK(ids, photosMap, 'hero', 3);
    expect(picks).toEqual(['hero', 'p1', 'p2']);
  });

  it('prefers aesthetic score over quality score when present', () => {
    const map = {
      hero: { id: 'hero', aestheticScore: 0.2, qualityScore: 0.9 },
      a: { id: 'a', aestheticScore: 0.8, qualityScore: 0.1 },
      b: { id: 'b', aestheticScore: 0.4, qualityScore: 0.9 },
    };
    const picks = pickTopK(['hero', 'a', 'b'], map, 'hero', 3);
    expect(picks).toEqual(['hero', 'a', 'b']);
  });

  it('returns just the hero at k=1', () => {
    expect(pickTopK(ids, photosMap, 'hero', 1)).toEqual(['hero']);
  });

  it('returns an empty array at k=0', () => {
    expect(pickTopK(ids, photosMap, 'hero', 0)).toEqual([]);
  });

  it('works without a hero (pure score order)', () => {
    const picks = pickTopK(['p1', 'p2', 'p3'], photosMap, null, 2);
    expect(picks).toEqual(['p1', 'p2']);
  });

  it('never returns more than k ids', () => {
    expect(pickTopK(ids, photosMap, 'hero', 2)).toHaveLength(2);
  });
});
