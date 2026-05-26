import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveSkeletonLocations } from './geocode.js';

describe('resolveSkeletonLocations', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not rate-limit chapters that have no coordinates', async () => {
    vi.useFakeTimers();
    const onProgress = vi.fn();

    const result = await resolveSkeletonLocations(
      {
        chapters: [
          { id: 'chapter_001', coords: null },
          { id: 'chapter_002', coords: null },
          { id: 'chapter_003', coords: null },
        ],
      },
      onProgress,
    );

    expect(result).toEqual({ chapterLocations: {}, country: null });
    expect(onProgress).toHaveBeenCalledTimes(3);
    expect(onProgress).toHaveBeenLastCalledWith(3, 3);
  });
});
