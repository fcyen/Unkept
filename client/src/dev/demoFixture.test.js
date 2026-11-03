import { describe, it, expect } from 'vitest';
import { buildDemoFixture, countCacheResults } from './demoFixture.js';

const snaps = (models) => ({
  exif: { count: 2, perPhoto: { a: { name: 'a.jpg', coords: { lat: 28.405661, lng: 83.775642 } }, b: { name: 'b.jpg', coords: null } } },
  thumbnail: { perPhoto: { a: { status: 'ok', thumbnailUrl: 'data:image/jpeg;base64,AAAA' } } },
  aestheticScore: { status: 'ok', modelLabels: ['A', 'B'], perPhoto: { a: { score: 0.8, models, error: null } } },
});

describe('buildDemoFixture', () => {
  it('keeps model results when the cache hit, and counts hits/misses', () => {
    const f = buildDemoFixture({
      snapshots: snaps([{ model: 'A', score: 0.8, cached: true }, { model: 'B', score: null, error: { kind: 'not_cached' } }]),
      images: { a: 'data:x' },
      generator: 'test',
      now: new Date('2026-11-03T10:20:30Z'),
    });
    expect(f.meta).toMatchObject({ version: '20261103102030', photoCount: 2, models: ['A', 'B'] });
    expect(f.meta.source).toMatchObject({ generator: 'test', cacheHits: 1, cacheMisses: 1 });
    expect(f.snapshots.aestheticScore.status).toBe('ok');
    expect(f.snapshots.aestheticScore.perPhoto.a.models).toHaveLength(2);
  });

  it('rounds GPS and drops pipeline thumbnails without mutating the input', () => {
    const input = snaps([{ model: 'A', score: 0.8 }]);
    const f = buildDemoFixture({ snapshots: input, images: {}, generator: 'test' });
    expect(f.snapshots.exif.perPhoto.a.coords).toEqual({ lat: 28.41, lng: 83.78 });
    expect(f.snapshots.thumbnail.perPhoto.a.thumbnailUrl).toBeNull();
    expect(input.exif.perPhoto.a.coords.lat).toBe(28.405661);
  });

  it('marks model results not_bundled when nothing came from the cache', () => {
    const f = buildDemoFixture({
      snapshots: snaps([{ model: 'A', score: null, error: { kind: 'not_cached' } }]),
      images: {},
      generator: 'test',
    });
    expect(f.meta.models).toEqual([]);
    expect(f.snapshots.aestheticScore.status).toBe('not_bundled');
    expect(f.snapshots.aestheticScore.perPhoto.a.models).toBeNull();
  });

  it('countCacheResults tolerates missing data', () => {
    expect(countCacheResults(undefined)).toEqual({ hits: 0, misses: 0 });
  });
});
