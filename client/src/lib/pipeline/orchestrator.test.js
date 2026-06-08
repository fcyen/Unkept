import { describe, it, expect, vi } from 'vitest';
import { runPhase1, PHASES } from './orchestrator.js';

describe('runPhase1', () => {
  it('walks stages in order, returns a valid skeleton, and strips File refs', async () => {
    const phases = [];
    const photo = {
      id: 'photo_0',
      name: 'a.jpg',
      timestamp: '2025-03-15T08:00:00Z',
      coords: { lat: 1, lng: 2 },
      file: {},
      width: 320,
      height: 200,
      orientation: 'landscape',
      thumbnailUrl: null,
      thumbnailHeroUrl: null,
      thumbnailFailed: false,
      qualityScore: null,
      faces: null,
    };

    const calls = [];
    const trace = (name, output) => async (input, options, onProgress) => {
      calls.push(name);
      if (onProgress) onProgress(1, 1);
      return typeof output === 'function' ? output(input, options) : output;
    };

    const heroSelectStage = vi.fn().mockImplementation(async (input) => {
      calls.push('heroSelect');
      return {
        clusters: input.clusters,
        heroIds: new Set([photo.id]),
        burstGroups: [],
        burstCandidates: [],
      };
    });

    const skeleton = await runPhase1([{}], {
      onPhase: (p) => phases.push(p),
      stages: {
        exif: trace('exif', [photo]),
        dedup: trace('dedup', { photos: [photo], burstGroups: [], burstCandidates: [] }),
        cluster: trace('cluster', { clusters: [[photo]], burstGroups: [], burstCandidates: [] }),
        heroSelect: heroSelectStage,
        chapterBuilder: trace('chapterBuilder', {
          chapters: [{
            id: 'chapter_001',
            photoIds: [photo.id],
            heroPhotoId: photo.id,
            date: '2025-03-15',
            coords: { lat: 1, lng: 2 },
          }],
          photos: new Map([[photo.id, photo]]),
          burstGroups: [],
        }),
        thumbnail: trace('thumbnail', (input) => {
          for (const [, p] of input.photos) p.thumbnailUrl = 'data:image/jpeg;base64,AAA';
          return input;
        }),
        qualityScore: trace('qualityScore', (input) => input),
      },
    });

    expect(phases).toEqual([PHASES.RUNNING, PHASES.DONE]);
    expect(calls).toEqual([
      'exif',
      'dedup',
      'cluster',
      'heroSelect',
      'chapterBuilder',
      'thumbnail',
      'qualityScore',
    ]);

    // heroSelect always receives an empty highlightDates list now that the
    // survey is gone — the option is kept so heroSelect's signature is stable.
    expect(heroSelectStage).toHaveBeenCalledWith(
      expect.anything(),
      { highlightDates: [] },
      expect.any(Function),
    );

    expect(skeleton.version).toBe('1.0');
    expect(skeleton.chapters).toHaveLength(1);
    expect(skeleton.photos[photo.id]).toBeDefined();
    expect(skeleton.photos[photo.id].orientation).toBe('landscape');
    expect(skeleton.photos[photo.id].width).toBe(320);
    expect(skeleton.photos[photo.id].height).toBe(200);
    expect(skeleton.photos[photo.id].file).toBeUndefined();
  });

  it('reports stage progress events', async () => {
    const photo = basicPhoto();
    const events = [];

    await runPhase1([{}], {
      onProgress: (e) => events.push(e),
      stages: {
        exif: async (_, __, onProgress) => { onProgress(1, 1); return [photo]; },
        dedup: async (_, __, onProgress) => {
          onProgress(1, 1);
          return { photos: [photo], burstGroups: [], burstCandidates: [] };
        },
        cluster: async (_, __, onProgress) => {
          onProgress(1, 1);
          return { clusters: [[photo]], burstGroups: [], burstCandidates: [] };
        },
        heroSelect: async (input) => ({
          clusters: input.clusters,
          heroIds: new Set([photo.id]),
          burstGroups: [],
          burstCandidates: [],
        }),
        chapterBuilder: async () => ({
          chapters: [{ id: 'chapter_001', photoIds: [photo.id], heroPhotoId: photo.id, date: '2025-03-15', coords: null }],
          photos: new Map([[photo.id, photo]]),
          burstGroups: [],
        }),
        thumbnail: async (input) => {
          for (const [, p] of input.photos) p.thumbnailUrl = 'data:image/jpeg;base64,AAA';
          return input;
        },
        qualityScore: async (input) => input,
      },
    });

    const stages = events.map((e) => e.stage);
    expect(stages).toEqual(expect.arrayContaining(['exif', 'dedup', 'cluster']));
  });

  it('brackets each stage with onStageStart/onStageComplete in order', async () => {
    // The telemetry pipeline_stage_duration event times stages off these
    // hooks, so the contract is: start fires immediately before a stage runs,
    // complete immediately after, for every stage, in pipeline order.
    const photo = basicPhoto();
    const log = [];

    await runPhase1([{}], {
      onStageStart: (stage) => log.push(`start:${stage}`),
      onStageComplete: (stage) => log.push(`complete:${stage}`),
      stages: {
        exif: async () => [photo],
        dedup: async () => ({ photos: [photo], burstGroups: [], burstCandidates: [] }),
        cluster: async () => ({ clusters: [[photo]], burstGroups: [], burstCandidates: [] }),
        heroSelect: async (input) => ({
          clusters: input.clusters,
          heroIds: new Set([photo.id]),
          burstGroups: [],
          burstCandidates: [],
        }),
        chapterBuilder: async () => ({
          chapters: [{ id: 'chapter_001', photoIds: [photo.id], heroPhotoId: photo.id, date: '2025-03-15', coords: null }],
          photos: new Map([[photo.id, photo]]),
          burstGroups: [],
        }),
        thumbnail: async (input) => input,
        qualityScore: async (input) => input,
      },
    });

    expect(log).toEqual([
      'start:exif', 'complete:exif',
      'start:dedup', 'complete:dedup',
      'start:cluster', 'complete:cluster',
      'start:heroSelect', 'complete:heroSelect',
      'start:chapterBuilder', 'complete:chapterBuilder',
      'start:thumbnail', 'complete:thumbnail',
      'start:qualityScore', 'complete:qualityScore',
    ]);
  });
});

function basicPhoto() {
  return {
    id: 'photo_0',
    name: 'a.jpg',
    timestamp: '2025-03-15T08:00:00Z',
    coords: null,
    file: {},
    thumbnailUrl: null,
    thumbnailHeroUrl: null,
    thumbnailFailed: false,
    qualityScore: null,
    faces: null,
  };
}
