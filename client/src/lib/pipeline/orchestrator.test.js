import { describe, it, expect, vi } from 'vitest';
import { extractDates, runPhase1, PHASES } from './orchestrator.js';

describe('extractDates', () => {
  it('returns unique YYYY-MM-DD dates sorted ascending', () => {
    const photos = [
      { timestamp: '2025-03-16T10:00:00Z' },
      { timestamp: '2025-03-15T08:00:00Z' },
      { timestamp: '2025-03-15T22:00:00Z' },
      { timestamp: null },
      { timestamp: 'not-a-date' },
    ];
    const result = extractDates(photos);
    expect(result).toEqual([toLocalDate('2025-03-15T08:00:00Z'), toLocalDate('2025-03-16T10:00:00Z')]);
  });

  it('returns empty array when no photos have timestamps', () => {
    expect(extractDates([{ timestamp: null }, {}])).toEqual([]);
  });
});

describe('runPhase1', () => {
  it('walks phases in order, threads survey config into heroSelect, returns a valid skeleton shape', async () => {
    const phases = [];
    const photo = {
      id: 'photo_0',
      name: 'a.jpg',
      timestamp: '2025-03-15T08:00:00Z',
      coords: { lat: 1, lng: 2 },
      file: {},
      thumbnailUrl: null,
      thumbnailHeroUrl: null,
      thumbnailFailed: false,
      qualityScore: null,
      faces: null,
    };

    const exifStage = vi.fn().mockResolvedValue([photo]);
    const dedupStage = vi.fn().mockResolvedValue({
      photos: [photo],
      burstGroups: [],
      burstCandidates: [],
    });
    const clusterStage = vi.fn().mockResolvedValue({
      clusters: [[photo]],
      burstGroups: [],
      burstCandidates: [],
    });
    const heroSelectStage = vi.fn().mockImplementation(async (input) => ({
      clusters: input.clusters,
      heroIds: new Set([photo.id]),
      burstGroups: [],
      burstCandidates: [],
    }));
    const chapterBuilderStage = vi.fn().mockResolvedValue({
      chapters: [{
        id: 'chapter_001',
        photoIds: [photo.id],
        heroPhotoId: photo.id,
        date: '2025-03-15',
        coords: { lat: 1, lng: 2 },
      }],
      photos: new Map([[photo.id, photo]]),
      burstGroups: [],
    });
    const thumbnailStage = vi.fn().mockImplementation(async (input) => {
      for (const [, p] of input.photos) {
        p.thumbnailUrl = 'data:image/jpeg;base64,AAA';
      }
      return input;
    });
    const qualityScoreStage = vi.fn().mockImplementation(async (input) => {
      for (const [, p] of input.photos) {
        p.qualityScore = 0.5;
      }
      return input;
    });

    let capturedDates = null;
    const skeleton = await runPhase1([{}], {
      onPhase: (p) => phases.push(p),
      onSurveyDates: (d) => { capturedDates = d; },
      getSurveyConfig: async () => ({ highlightDates: ['2025-03-15'] }),
      stages: {
        exif: exifStage,
        dedup: dedupStage,
        cluster: clusterStage,
        heroSelect: heroSelectStage,
        chapterBuilder: chapterBuilderStage,
        thumbnail: thumbnailStage,
        qualityScore: qualityScoreStage,
      },
    });

    expect(phases).toEqual([
      PHASES.PHASE_1A,
      PHASES.AWAITING_SURVEY,
      PHASES.PHASE_1B,
      PHASES.DONE,
    ]);
    expect(capturedDates).toEqual(['2025-03-15']);

    // Survey config was threaded into heroSelect
    expect(heroSelectStage).toHaveBeenCalledWith(
      expect.anything(),
      { highlightDates: ['2025-03-15'] },
      expect.any(Function),
    );

    // Skeleton has expected top-level shape
    expect(skeleton.version).toBe('1.0');
    expect(skeleton.chapters).toHaveLength(1);
    expect(skeleton.photos[photo.id]).toBeDefined();
    expect(skeleton.meta.surveyResponses).toEqual({ highlightDates: ['2025-03-15'] });

    // File reference was stripped before serialisation
    expect(skeleton.photos[photo.id].file).toBeUndefined();
  });

  it('defaults highlightDates to [] when survey resolves with empty object (skip/timeout)', async () => {
    const photo = basicPhoto();
    const heroSelectStage = vi.fn().mockImplementation(async (input) => ({
      clusters: input.clusters,
      heroIds: new Set([photo.id]),
      burstGroups: [],
      burstCandidates: [],
    }));

    await runPhase1([{}], {
      getSurveyConfig: async () => ({}),
      stages: {
        exif: async () => [photo],
        dedup: async () => ({ photos: [photo], burstGroups: [], burstCandidates: [] }),
        cluster: async () => ({ clusters: [[photo]], burstGroups: [], burstCandidates: [] }),
        heroSelect: heroSelectStage,
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

    expect(heroSelectStage).toHaveBeenCalledWith(
      expect.anything(),
      { highlightDates: [] },
      expect.any(Function),
    );
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

// Timestamps are parsed in local time by `extractDates`, so we can't assume
// UTC. Round-trip through the same Date API to compute the expected key.
function toLocalDate(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
