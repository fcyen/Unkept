import { describe, expect, it } from 'vitest';
import { createStoryRunId, sanitizeProperties } from './analytics.js';

describe('analytics', () => {
  it('creates run-prefixed story IDs', () => {
    expect(createStoryRunId()).toMatch(/^run_/);
  });

  it('removes sensitive photo metadata from event properties', () => {
    const sanitized = sanitizeProperties({
      storyRunId: 'run_123',
      storyIntent: 'people',
      photoCount: 12,
      filename: 'IMG_0001.JPG',
      coords: { lat: 1, lng: 2 },
      thumbnailUrl: 'data:image/jpeg;base64,AAA',
      photoIds: ['photo_1'],
      skeleton: { photos: {} },
      nested: { notAllowed: true },
    });

    expect(sanitized).toEqual({
      storyRunId: 'run_123',
      storyIntent: 'people',
      photoCount: 12,
    });
  });
});
