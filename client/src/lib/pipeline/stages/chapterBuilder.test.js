import { describe, it, expect } from 'vitest';
import { chapterBuilderStage, getMedianCoords } from './chapterBuilder.js';
import { isValidSkeleton } from '../../validateSkeleton.js';
import { assembleSkeleton } from '../runner.js';

function makePhoto(id, timestamp = null, coords = null) {
  return {
    id,
    name: `${id}.jpg`,
    file: { name: `${id}.jpg`, size: 1000 },
    timestamp,
    coords,
    thumbnailUrl: `data:image/jpeg;base64,/9j/fake${id}`,
    thumbnailHeroUrl: null,
    thumbnailFailed: false,
    qualityScore: 0.5,
    faces: null,
  };
}

describe('chapterBuilderStage', () => {
  it('creates chapters from clusters with heroPhotoId', async () => {
    const clusters = [
      [makePhoto('p1', '2025-03-15T08:00:00Z'), makePhoto('p2', '2025-03-15T09:00:00Z')],
      [makePhoto('p3', '2025-03-16T10:00:00Z')],
    ];
    const heroIds = new Set(['p1', 'p3']);

    const result = await chapterBuilderStage({ clusters, heroIds });

    expect(result.chapters).toHaveLength(2);
    expect(result.chapters[0].heroPhotoId).toBe('p1');
    expect(result.chapters[0].photoIds).toEqual(['p1', 'p2']);
    expect(result.chapters[1].heroPhotoId).toBe('p3');
    expect(result.chapters[1].photoIds).toEqual(['p3']);
  });

  it('all chapters have a heroPhotoId', async () => {
    const clusters = [
      [makePhoto('p1'), makePhoto('p2'), makePhoto('p3')],
      [makePhoto('p4')],
      [makePhoto('p5'), makePhoto('p6')],
    ];
    const heroIds = new Set(['p2', 'p4', 'p5']);

    const result = await chapterBuilderStage({ clusters, heroIds });

    for (const chapter of result.chapters) {
      expect(chapter.heroPhotoId).toBeTruthy();
      expect(chapter.photoIds).toContain(chapter.heroPhotoId);
    }
  });

  it('handles empty clusters array', async () => {
    const result = await chapterBuilderStage({ clusters: [], heroIds: new Set() });
    expect(result.chapters).toEqual([]);
    expect(result.photos.size).toBe(0);
  });

  it('falls back to middle photo if heroId not found in cluster', async () => {
    const clusters = [
      [makePhoto('p1'), makePhoto('p2'), makePhoto('p3')],
    ];
    const heroIds = new Set(['unknown_id']);

    const result = await chapterBuilderStage({ clusters, heroIds });

    // Should fall back to middle photo (index 1 = p2)
    expect(result.chapters[0].heroPhotoId).toBe('p2');
  });

  it('output passes isValidSkeleton when assembled', async () => {
    const clusters = [
      [
        makePhoto('p1', '2025-03-15T08:00:00Z', { lat: 35.67, lng: 139.65 }),
        makePhoto('p2', '2025-03-15T12:00:00Z', { lat: 35.68, lng: 139.66 }),
      ],
      [
        makePhoto('p3', '2025-03-16T09:00:00Z'),
      ],
    ];
    const heroIds = new Set(['p1', 'p3']);

    const result = await chapterBuilderStage({ clusters, heroIds });

    // Strip file references before validation (as the pipeline would)
    for (const [, photo] of result.photos) {
      delete photo.file;
    }

    const skeleton = assembleSkeleton(result, {
      totalPhotosInput: 5,
      totalPhotosAfterDedup: 3,
      surveyResponses: {},
    });

    const validation = isValidSkeleton(skeleton);
    expect(validation.valid).toBe(true);
  });

  it('no File objects in assembled skeleton', async () => {
    const clusters = [
      [makePhoto('p1', '2025-03-15T08:00:00Z')],
    ];
    const heroIds = new Set(['p1']);

    const result = await chapterBuilderStage({ clusters, heroIds });

    // Strip file references
    for (const [, photo] of result.photos) {
      delete photo.file;
    }

    const skeleton = assembleSkeleton(result, {
      totalPhotosInput: 1,
      totalPhotosAfterDedup: 1,
    });

    // Check no File objects remain
    for (const photo of Object.values(skeleton.photos)) {
      expect(photo.file).toBeUndefined();
    }

    // Check no blob URLs
    const json = JSON.stringify(skeleton);
    expect(json).not.toContain('blob:');
  });
});

describe('getMedianCoords', () => {
  it('returns null for photos without GPS', () => {
    const cluster = [makePhoto('p1'), makePhoto('p2')];
    expect(getMedianCoords(cluster)).toBeNull();
  });

  it('returns median coordinates', () => {
    const cluster = [
      makePhoto('p1', null, { lat: 10, lng: 20 }),
      makePhoto('p2', null, { lat: 30, lng: 40 }),
      makePhoto('p3', null, { lat: 20, lng: 30 }),
    ];

    const coords = getMedianCoords(cluster);
    expect(coords.lat).toBe(20);
    expect(coords.lng).toBe(30);
  });

  it('ignores photos without coords in median calculation', () => {
    const cluster = [
      makePhoto('p1', null, { lat: 10, lng: 20 }),
      makePhoto('p2', null, null),
      makePhoto('p3', null, { lat: 30, lng: 40 }),
    ];

    const coords = getMedianCoords(cluster);
    // With 2 photos: median is at index 1 (floor(2/2) = 1)
    expect(coords).not.toBeNull();
  });
});
