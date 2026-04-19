/**
 * Phase 1 orchestrator — runs Phase 1A (EXIF → dedup → cluster), pauses for
 * a survey checkpoint, then runs Phase 1B (hero → chapter → thumbnail →
 * quality) and assembles a Story Skeleton.
 *
 * Extracted from `usePipeline` so the orchestration logic is testable
 * without React. The hook is a thin state-holding wrapper around this.
 *
 * `getSurveyConfig` is a function returning a Promise that resolves with
 * `{ highlightDates?: string[] }`. The caller (hook) builds that promise
 * however it wants — typically tied to a modal's submit/skip/timeout.
 */
import { exifStage } from './stages/exif.js';
import { dedupStage } from './stages/dedup.js';
import { clusterStage } from './stages/cluster.js';
import { heroSelectStage } from './stages/heroSelect.js';
import { chapterBuilderStage } from './stages/chapterBuilder.js';
import { thumbnailStage } from './stages/thumbnail.js';
import { qualityScoreStage } from './stages/qualityScore.js';
import { assembleSkeleton } from './runner.js';
import { createMemoryManager } from '../memoryManager.js';

export const PHASES = Object.freeze({
  IDLE: 'idle',
  PHASE_1A: 'phase1a',
  AWAITING_SURVEY: 'awaiting_survey',
  PHASE_1B: 'phase1b',
  DONE: 'done',
  ERROR: 'error',
});

/**
 * Extract unique calendar dates (YYYY-MM-DD) from photo timestamps.
 * Stable order — sorted ascending.
 */
export function extractDates(photos) {
  const set = new Set();
  for (const p of photos) {
    if (!p.timestamp) continue;
    const dt = new Date(p.timestamp);
    if (Number.isNaN(dt.getTime())) continue;
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    set.add(key);
  }
  return [...set].sort();
}

/**
 * Run the full Phase 1 pipeline and return a Story Skeleton.
 *
 * @param {File[]} files
 * @param {object} deps
 * @param {(phase: string) => void} [deps.onPhase]
 * @param {(event: { stage: string, progress: number, total: number }) => void} [deps.onProgress]
 * @param {(dates: string[]) => void} [deps.onSurveyDates]
 *        called once, after EXIF completes, with the unique dates found
 * @param {(context: { dates: string[] }) => Promise<{ highlightDates?: string[] }>} deps.getSurveyConfig
 *        called when Phase 1A is done. Resolves with survey answers (or
 *        empty object for skip/timeout). The hook wires this to the modal.
 * @param {object} [deps.stages]
 *        override any of the stage functions — used only for testing
 * @returns {Promise<object>} Story Skeleton
 */
export async function runPhase1(files, deps) {
  const {
    onPhase = noop,
    onProgress = noop,
    onSurveyDates = noop,
    getSurveyConfig,
    stages: stageOverrides = {},
  } = deps;

  const stages = {
    exif: exifStage,
    dedup: dedupStage,
    cluster: clusterStage,
    heroSelect: heroSelectStage,
    chapterBuilder: chapterBuilderStage,
    thumbnail: thumbnailStage,
    qualityScore: qualityScoreStage,
    ...stageOverrides,
  };

  const mm = createMemoryManager();

  onPhase(PHASES.PHASE_1A);

  const emit = (stage) => (progress, total) =>
    onProgress({ stage, progress, total });

  // ---- Phase 1A: EXIF ----
  const photos = await stages.exif(files, {}, emit('exif'));

  // Dates are known after EXIF — surface them so the modal can render
  // options while dedup + cluster run.
  const dates = extractDates(photos);
  onSurveyDates(dates);

  // ---- Phase 1A: dedup ----
  const dedupResult = await stages.dedup(photos, {}, emit('dedup'));

  // ---- Phase 1A: cluster ----
  const clusterResult = await stages.cluster(dedupResult, {}, emit('cluster'));

  // ---- Checkpoint: wait for survey ----
  onPhase(PHASES.AWAITING_SURVEY);
  const surveyConfig = (await getSurveyConfig({ dates })) || {};
  const highlightDates = Array.isArray(surveyConfig.highlightDates)
    ? surveyConfig.highlightDates
    : [];

  // ---- Phase 1B: hero → chapter → thumbnail → quality ----
  onPhase(PHASES.PHASE_1B);

  const heroResult = await stages.heroSelect(
    clusterResult,
    { highlightDates },
    emit('heroSelect'),
  );

  const chapterResult = await stages.chapterBuilder(
    heroResult,
    {},
    emit('chapterBuilder'),
  );

  const thumbResult = await stages.thumbnail(
    chapterResult,
    {},
    emit('thumbnail'),
  );

  const qualityResult = await stages.qualityScore(
    thumbResult,
    {},
    emit('qualityScore'),
  );

  // Strip File references before serialising the skeleton.
  mm.stripFileReferences(qualityResult.photos);

  const skeleton = assembleSkeleton(
    {
      chapters: qualityResult.chapters,
      photos: qualityResult.photos,
      burstGroups: chapterResult.burstGroups,
    },
    {
      totalPhotosInput: files.length,
      totalPhotosAfterDedup: dedupResult.photos.length,
      surveyResponses: { highlightDates },
    },
  );

  mm.revokeAll();
  onPhase(PHASES.DONE);

  return skeleton;
}

function noop() {}
