import { describe, it, expect } from 'vitest';
import { skeletonToLegacyStory } from './skeletonToLegacyStory.js';

function makeSkeleton(chapters, photos) {
  return {
    version: '1.0',
    generatedAt: '2025-03-20T14:00:00Z',
    photos,
    chapters,
    burstGroups: [],
    meta: {
      totalPhotosInput: Object.keys(photos).length,
      totalPhotosAfterDedup: Object.keys(photos).length,
      totalChapters: chapters.length,
      dateRange: null,
      surveyResponses: {},
    },
  };
}

describe('skeletonToLegacyStory', () => {
  it('builds one legacy chapter per skeleton chapter with photo objects + heroPhoto', () => {
    const photos = {
      p1: {
        id: 'p1',
        name: 'a.jpg',
        timestamp: '2025-03-15T08:00:00Z',
        coords: { lat: 10, lng: 20 },
        thumbnailUrl: 'data:image/jpeg;base64,AAA',
        thumbnailHeroUrl: 'data:image/jpeg;base64,HHH',
        thumbnailFailed: false,
        qualityScore: 0.9,
        faces: null,
      },
      p2: {
        id: 'p2',
        name: 'b.jpg',
        timestamp: '2025-03-15T18:00:00Z',
        coords: null,
        thumbnailUrl: 'data:image/jpeg;base64,BBB',
        thumbnailHeroUrl: null,
        thumbnailFailed: false,
        qualityScore: 0.5,
        faces: null,
      },
    };
    const skeleton = makeSkeleton(
      [{ id: 'chapter_001', photoIds: ['p1', 'p2'], heroPhotoId: 'p1', date: '2025-03-15', coords: { lat: 10, lng: 20 } }],
      photos,
    );

    const story = skeletonToLegacyStory(skeleton);

    expect(story.chapters).toHaveLength(1);
    const ch = story.chapters[0];
    expect(ch.activity).toBe('Day 1');
    expect(ch.date).toBe('2025-03-15');
    expect(ch.photoCount).toBe(2);
    expect(ch.photos).toHaveLength(2);
    expect(ch.photos[0]).toMatchObject({
      id: 'p1',
      latitude: 10,
      longitude: 20,
      thumbnailUrl: 'data:image/jpeg;base64,AAA',
      objectUrl: 'data:image/jpeg;base64,AAA',
    });
    expect(ch.heroPhoto).toMatchObject({
      id: 'p1',
      thumbnailUrl: 'data:image/jpeg;base64,HHH', // hero tier preferred
    });
    expect(ch.location).toBeNull();
    expect(ch.venue).toBeNull();
  });

  it('falls back to 200px url when hero tier is null (mobile)', () => {
    const photos = {
      p1: {
        id: 'p1',
        name: 'a.jpg',
        timestamp: null,
        coords: null,
        thumbnailUrl: 'data:image/jpeg;base64,AAA',
        thumbnailHeroUrl: null,
        thumbnailFailed: false,
        qualityScore: null,
        faces: null,
      },
    };
    const skeleton = makeSkeleton(
      [{ id: 'chapter_001', photoIds: ['p1'], heroPhotoId: 'p1', date: null, coords: null }],
      photos,
    );

    const story = skeletonToLegacyStory(skeleton);
    expect(story.chapters[0].heroPhoto.thumbnailUrl).toBe('data:image/jpeg;base64,AAA');
  });

  it('computes start/end time from photo timestamps', () => {
    const photos = {
      p1: mkPhoto('p1', '2025-03-15T08:15:00'),
      p2: mkPhoto('p2', '2025-03-15T19:45:00'),
      p3: mkPhoto('p3', '2025-03-15T12:00:00'),
    };
    const skeleton = makeSkeleton(
      [{ id: 'chapter_001', photoIds: ['p1', 'p2', 'p3'], heroPhotoId: 'p1', date: '2025-03-15', coords: null }],
      photos,
    );
    const ch = skeletonToLegacyStory(skeleton).chapters[0];
    expect(ch.start_time).toMatch(/^\d{2}:\d{2}$/);
    expect(ch.end_time).toMatch(/^\d{2}:\d{2}$/);
    expect(ch.start_time < ch.end_time).toBe(true);
  });

  it('returns null start/end time for chapters with no timestamps', () => {
    const photos = { p1: mkPhoto('p1', null) };
    const skeleton = makeSkeleton(
      [{ id: 'chapter_001', photoIds: ['p1'], heroPhotoId: 'p1', date: null, coords: null }],
      photos,
    );
    const ch = skeletonToLegacyStory(skeleton).chapters[0];
    expect(ch.start_time).toBeNull();
    expect(ch.end_time).toBeNull();
  });
});

function mkPhoto(id, timestamp) {
  return {
    id,
    name: `${id}.jpg`,
    timestamp,
    coords: null,
    thumbnailUrl: `data:image/jpeg;base64,${id}`,
    thumbnailHeroUrl: null,
    thumbnailFailed: false,
    qualityScore: 0.5,
    faces: null,
  };
}
