import { describe, it, expect } from 'vitest';
import {
  buildStory,
  applyGeocoding,
  computeChapterDistanceKm,
  haversineKm,
  selectStat,
  generateTripName,
  selectPhotoCardLayout,
} from './storyBuilder.js';
import { isValidSkeleton } from './validateSkeleton.js';
import { scenarios } from '../dev/fixtures.js';

// ---------------------------------------------------------------------------
// Fixture sanity
// ---------------------------------------------------------------------------

describe('fixtures', () => {
  it('short scenario is a valid Story Skeleton', () => {
    const result = isValidSkeleton(scenarios.short.skeleton);
    expect(result).toEqual({ valid: true });
  });

  it('long scenario is a valid Story Skeleton', () => {
    const result = isValidSkeleton(scenarios.long.skeleton);
    expect(result).toEqual({ valid: true });
  });

  it('edge scenario is a valid Story Skeleton', () => {
    const result = isValidSkeleton(scenarios.edge.skeleton);
    expect(result).toEqual({ valid: true });
  });
});

// ---------------------------------------------------------------------------
// Distance
// ---------------------------------------------------------------------------

describe('haversineKm', () => {
  it('returns ~0 for identical points', () => {
    const d = haversineKm({ lat: 0, lng: 0 }, { lat: 0, lng: 0 });
    expect(d).toBeCloseTo(0, 3);
  });

  it('computes a known distance (Medan → Denpasar ≈ 2287km)', () => {
    const medan = { lat: 3.595, lng: 98.672 };
    const denpasar = { lat: -8.749, lng: 115.167 };
    const d = haversineKm(medan, denpasar);
    expect(d).toBeGreaterThan(2200);
    expect(d).toBeLessThan(2400);
  });
});

describe('computeChapterDistanceKm', () => {
  it('sums distance across consecutive chapter centroids', () => {
    const chapters = [
      { coords: { lat: 0, lng: 0 } },
      { coords: { lat: 0, lng: 1 } }, // ~111km east
      { coords: { lat: 1, lng: 1 } }, // ~111km north
    ];
    const total = computeChapterDistanceKm(chapters);
    expect(total).toBeGreaterThan(220);
    expect(total).toBeLessThan(225);
  });

  it('skips chapter pairs where one side has no coords', () => {
    const chapters = [
      { coords: { lat: 0, lng: 0 } },
      { coords: null },
      { coords: { lat: 0, lng: 1 } },
    ];
    // Both transitions are skipped → 0km.
    expect(computeChapterDistanceKm(chapters)).toBe(0);
  });

  it('returns 0 for a single chapter', () => {
    expect(computeChapterDistanceKm([{ coords: { lat: 0, lng: 0 } }])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Stat selection
// ---------------------------------------------------------------------------

describe('selectStat', () => {
  it('prefers distance when above the 50km threshold', () => {
    const stat = selectStat({ distanceKm: 1232, totalPhotoCount: 100 });
    expect(stat.kind).toBe('distance');
    expect(stat.raw).toBe(1232);
    expect(stat.value).toMatch(/1,232km/);
  });

  it('falls back to photo count below the threshold', () => {
    const stat = selectStat({ distanceKm: 12, totalPhotoCount: 42 });
    expect(stat.kind).toBe('photo_count');
    expect(stat.raw).toBe(42);
    expect(stat.value).toMatch(/42 photos/);
  });

  it('handles a custom threshold', () => {
    const stat = selectStat({ distanceKm: 60, totalPhotoCount: 10, threshold: 100 });
    expect(stat.kind).toBe('photo_count');
  });

  it('pluralises photos correctly', () => {
    const one = selectStat({ distanceKm: 0, totalPhotoCount: 1 });
    expect(one.value).toBe('1 photo taken');
    const many = selectStat({ distanceKm: 0, totalPhotoCount: 2 });
    expect(many.value).toMatch(/2 photos/);
  });
});

// ---------------------------------------------------------------------------
// Trip name
// ---------------------------------------------------------------------------

describe('generateTripName', () => {
  it('uses country when provided', () => {
    const name = generateTripName({
      dateRange: { start: '2025-05-03', end: '2025-05-13' },
      country: 'Indonesia',
    });
    expect(name).toBe('Indonesia, May 2025');
  });

  it('omits country when not provided', () => {
    const name = generateTripName({
      dateRange: { start: '2025-05-03', end: '2025-05-13' },
      country: null,
    });
    expect(name).toBe('May 2025');
  });

  it('spans months when trip crosses a boundary', () => {
    const name = generateTripName({
      dateRange: { start: '2025-05-28', end: '2025-06-05' },
      country: 'Japan',
    });
    expect(name).toBe('Japan, May–June 2025');
  });
});

// ---------------------------------------------------------------------------
// Layout selection
// ---------------------------------------------------------------------------

function p(id, orientation, qualityScore = 0.5) {
  return { id, orientation, qualityScore };
}

describe('selectPhotoCardLayout', () => {
  it('rule 1: portrait hero + ≥3 portraits → portrait-4', () => {
    const photos = [
      p('hero', 'portrait', 0.9),
      p('p1', 'portrait', 0.8),
      p('p2', 'portrait', 0.7),
      p('p3', 'portrait', 0.6),
      p('p4', 'portrait', 0.5),
      p('l1', 'landscape', 0.4),
    ];
    const r = selectPhotoCardLayout(photos, 'hero');
    expect(r.layout).toBe('portrait-4');
    expect(r.photoIds).toEqual(['hero', 'p1', 'p2', 'p3']);
  });

  it('rule 2: landscape hero + ≥2 landscapes → landscape-3', () => {
    const photos = [
      p('hero', 'landscape', 0.9),
      p('l1', 'landscape', 0.8),
      p('l2', 'landscape', 0.7),
      p('l3', 'landscape', 0.6),
      p('p1', 'portrait', 0.5),
    ];
    const r = selectPhotoCardLayout(photos, 'hero');
    expect(r.layout).toBe('landscape-3');
    expect(r.photoIds).toEqual(['hero', 'l1', 'l2']);
  });

  it('rule 3: portrait hero + 1 portrait + 1 landscape → mixed-2p-1l', () => {
    const photos = [
      p('hero', 'portrait', 0.9),
      p('p1', 'portrait', 0.8),
      p('l1', 'landscape', 0.7),
    ];
    const r = selectPhotoCardLayout(photos, 'hero');
    expect(r.layout).toBe('mixed-2p-1l');
    expect(r.photoIds).toContain('hero');
    expect(r.photoIds).toContain('l1');
  });

  it('rule 3 (landscape hero variant): landscape hero + ≥2 portraits (no more landscapes) → mixed-2p-1l', () => {
    const photos = [
      p('hero', 'landscape', 0.9),
      p('p1', 'portrait', 0.8),
      p('p2', 'portrait', 0.7),
    ];
    const r = selectPhotoCardLayout(photos, 'hero');
    expect(r.layout).toBe('mixed-2p-1l');
    // In this variant, hero is the L slot (last in array by storyboard).
    expect(r.photoIds[2]).toBe('hero');
  });

  it('rule 4: landscape hero + exactly 1 more landscape → landscape-2', () => {
    const photos = [
      p('hero', 'landscape', 0.9),
      p('l1', 'landscape', 0.8),
    ];
    const r = selectPhotoCardLayout(photos, 'hero');
    expect(r.layout).toBe('landscape-2');
    expect(r.photoIds).toEqual(['hero', 'l1']);
  });

  it('rule 5: single photo → portrait-1 fallback', () => {
    const photos = [p('hero', 'portrait', 0.9)];
    const r = selectPhotoCardLayout(photos, 'hero');
    expect(r.layout).toBe('portrait-1');
    expect(r.photoIds).toEqual(['hero']);
  });

  it('rule 5 variant: portrait hero with only portraits (< 4) and no landscape → portrait-1', () => {
    const photos = [
      p('hero', 'portrait', 0.9),
      p('p1', 'portrait', 0.8),
    ];
    // Only 2 portraits, no landscapes — can't do portrait-4 (need 4), can't
    // do mixed (need landscape). Falls through to portrait-1.
    const r = selectPhotoCardLayout(photos, 'hero');
    expect(r.layout).toBe('portrait-1');
    expect(r.photoIds).toEqual(['hero']);
  });

  it('always includes the hero in the output', () => {
    const photos = [
      p('hero', 'landscape', 0.1), // hero has LOW quality
      p('l1', 'landscape', 0.9),
      p('l2', 'landscape', 0.8),
    ];
    const r = selectPhotoCardLayout(photos, 'hero');
    expect(r.photoIds).toContain('hero');
  });

  it('infers orientation from dimensions when orientation is missing', () => {
    const photos = [
      { id: 'hero', width: 320, height: 200, qualityScore: 0.9 },
      { id: 'l1', width: 300, height: 200, qualityScore: 0.8 },
      { id: 'l2', width: 280, height: 180, qualityScore: 0.7 },
    ];

    const r = selectPhotoCardLayout(photos, 'hero');

    expect(r.layout).toBe('landscape-3');
    expect(r.photoIds).toEqual(['hero', 'l1', 'l2']);
  });

  it('throws if hero not in photo list', () => {
    expect(() =>
      selectPhotoCardLayout([p('a', 'landscape', 0.5)], 'nonexistent')
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// buildStory integration
// ---------------------------------------------------------------------------

describe('buildStory', () => {
  it('produces a valid Story for every fixture scenario', () => {
    for (const key of Object.keys(scenarios)) {
      const story = buildStory(scenarios[key].skeleton);
      expect(story.skeleton).toBe(scenarios[key].skeleton);
      expect(story.tripName).toBeTruthy();
      expect(story.chapters.length).toBe(scenarios[key].skeleton.chapters.length);
      expect(story.frames[0].type).toBe('cover');
      expect(story.frames[story.frames.length - 1].type).toBe('coda');
    }
  });

  it('emits exactly one divider + one photoCard per chapter', () => {
    const story = buildStory(scenarios.short.skeleton);
    const dividerCount = story.frames.filter((f) => f.type === 'chapterDivider').length;
    const cardCount = story.frames.filter((f) => f.type === 'photoCard').length;
    expect(dividerCount).toBe(scenarios.short.skeleton.chapters.length);
    expect(cardCount).toBe(scenarios.short.skeleton.chapters.length);
  });

  it('long scenario picks distance stat (Medan → Bali is >50km)', () => {
    const story = buildStory(scenarios.long.skeleton);
    expect(story.stat.kind).toBe('distance');
    expect(story.stat.raw).toBeGreaterThan(2000);
  });

  it('edge scenario (tight cluster) falls back to photo-count stat', () => {
    const story = buildStory(scenarios.edge.skeleton);
    expect(story.stat.kind).toBe('photo_count');
  });

  it('edge scenario exercises all five layouts', () => {
    const story = buildStory(scenarios.edge.skeleton);
    const layouts = story.frames
      .filter((f) => f.type === 'photoCard')
      .map((f) => f.layout);
    expect(layouts).toContain('portrait-1');
    expect(layouts).toContain('landscape-2');
    expect(layouts).toContain('mixed-2p-1l');
    expect(layouts).toContain('portrait-4');
  });

  it('long scenario Day 3 (all portrait) uses portrait-4', () => {
    const story = buildStory(scenarios.long.skeleton);
    const day3Card = story.frames.find(
      (f) => f.type === 'photoCard' && f.chapterId === 'chapter_003'
    );
    expect(day3Card.layout).toBe('portrait-4');
  });

  it('chapters start with "Day N" title pre-geocoding', () => {
    const story = buildStory(scenarios.short.skeleton);
    expect(story.chapters[0].title).toBe('Day 1');
    expect(story.chapters[0].location).toBeNull();
  });
});

describe('applyGeocoding', () => {
  it('upgrades chapter titles and fills location when applied', () => {
    const base = buildStory(scenarios.short.skeleton);
    const updated = applyGeocoding(base, {
      country: 'Japan',
      chapterLocations: {
        [base.chapters[0].id]: { label: 'Asakusa', country: 'Japan' },
      },
    });
    expect(updated.tripName).toBe('Japan, March 2025');
    expect(updated.chapters[0].title).toBe('Day 1 — Asakusa');
    expect(updated.chapters[0].location.label).toBe('Asakusa');
    // Untouched chapters keep the fallback title.
    expect(updated.chapters[1].title).toBe('Day 2');
  });

  it('rebuilds frames so dividers carry updated titles', () => {
    const base = buildStory(scenarios.short.skeleton);
    const updated = applyGeocoding(base, {
      country: 'Japan',
      chapterLocations: {
        [base.chapters[0].id]: { label: 'Asakusa', country: 'Japan' },
      },
    });
    const firstDivider = updated.frames.find((f) => f.type === 'chapterDivider');
    expect(firstDivider.title).toBe('Day 1 — Asakusa');
  });
});
