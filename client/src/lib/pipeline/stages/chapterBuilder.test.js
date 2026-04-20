import { describe, it, expect } from 'vitest';
import { chapterBuilderStage } from './chapterBuilder.js';
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

  it('includes burst candidates in photos map but not in chapter photoIds', async () => {
    const clusters = [
      [makePhoto('p1', '2025-03-15T08:00:00Z'), makePhoto('p2', '2025-03-15T09:00:00Z')],
    ];
    const heroIds = new Set(['p1']);
    const burstGroups = [{ representativeId: 'p1', candidateIds: ['p1_burst1', 'p1_burst2'] }];
    const burstCandidates = [
      makePhoto('p1_burst1', '2025-03-15T08:00:01Z'),
      makePhoto('p1_burst2', '2025-03-15T08:00:02Z'),
    ];

    const result = await chapterBuilderStage({ clusters, heroIds, burstGroups, burstCandidates });

    // Chapter photoIds only contain cluster photos, not burst candidates
    expect(result.chapters[0].photoIds).toEqual(['p1', 'p2']);
    expect(result.chapters[0].photoIds).not.toContain('p1_burst1');

    // But photos map includes everyone (for thumbnail generation + skeleton)
    expect(result.photos.size).toBe(4);
    expect(result.photos.has('p1_burst1')).toBe(true);
    expect(result.photos.has('p1_burst2')).toBe(true);

    // burstGroups preserved
    expect(result.burstGroups).toHaveLength(1);
    expect(result.burstGroups[0].representativeId).toBe('p1');
    expect(result.burstGroups[0].candidateIds).toEqual(['p1_burst1', 'p1_burst2']);
  });

  it('drops burst groups whose representative is not in any chapter', async () => {
    const clusters = [
      [makePhoto('p1', '2025-03-15T08:00:00Z')],
    ];
    const heroIds = new Set(['p1']);
    // Dangling burst group — its representative p99 was never selected
    const burstGroups = [
      { representativeId: 'p1', candidateIds: ['p1_burst1'] },
      { representativeId: 'p99', candidateIds: ['p99_burst1'] },
    ];
    const burstCandidates = [
      makePhoto('p1_burst1'),
      makePhoto('p99_burst1'),
    ];

    const result = await chapterBuilderStage({ clusters, heroIds, burstGroups, burstCandidates });

    expect(result.burstGroups).toHaveLength(1);
    expect(result.burstGroups[0].representativeId).toBe('p1');
    // Only the valid burst candidate should be in photos map
    expect(result.photos.has('p1_burst1')).toBe(true);
    expect(result.photos.has('p99_burst1')).toBe(false);
  });

  it('burst groups survive into assembled skeleton and pass validation', async () => {
    const clusters = [
      [makePhoto('p1', '2025-03-15T08:00:00Z', { lat: 35.67, lng: 139.65 })],
    ];
    const heroIds = new Set(['p1']);
    const burstGroups = [{ representativeId: 'p1', candidateIds: ['p1_burst1'] }];
    const burstCandidates = [makePhoto('p1_burst1', '2025-03-15T08:00:01Z')];

    const result = await chapterBuilderStage({ clusters, heroIds, burstGroups, burstCandidates });

    for (const [, photo] of result.photos) {
      delete photo.file;
    }

    const skeleton = assembleSkeleton(result, {
      totalPhotosInput: 2,
      totalPhotosAfterDedup: 1,
    });

    expect(skeleton.burstGroups).toHaveLength(1);
    expect(skeleton.burstGroups[0].representativeId).toBe('p1');
    expect(skeleton.burstGroups[0].candidateIds).toEqual(['p1_burst1']);
    expect(skeleton.photos['p1_burst1']).toBeDefined();

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

describe('chapter coords', () => {
  it('is null when the hero file has no EXIF GPS', async () => {
    // makePhoto's fake file has no EXIF payload — exifr.gps returns null.
    const clusters = [[makePhoto('p1', '2025-03-15T08:00:00Z')]];
    const heroIds = new Set(['p1']);

    const result = await chapterBuilderStage({ clusters, heroIds });

    expect(result.chapters[0].coords).toBeNull();
  });
});
