/**
 * Phase 1 orchestrator — runs the full pipeline (EXIF → dedup → cluster →
 * hero → chapter → thumbnail → quality) and assembles a Story Skeleton.
 *
 * Extracted from `usePipeline` so the orchestration logic is testable
 * without React. The hook is a thin state-holding wrapper around this.
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
  RUNNING: 'running',
  DONE: 'done',
  ERROR: 'error',
});

/**
 * Run the full Phase 1 pipeline and return a Story Skeleton.
 *
 * @param {File[]} files
 * @param {object} deps
 * @param {(phase: string) => void} [deps.onPhase]
 * @param {(event: { stage: string, progress: number, total: number }) => void} [deps.onProgress]
 * @param {object} [deps.stages]
 *        override any of the stage functions — used only for testing
 * @param {{ storyRunId?: string, preferences?: object }} [deps.storyConfig]
 * @returns {Promise<object>} Story Skeleton
 */
export async function runPhase1(files, deps = {}) {
  const {
    onPhase = noop,
    onProgress = noop,
    onStageStart = noop,
    onStageComplete = noop,
    stages: stageOverrides = {},
    storyConfig = {},
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

  onPhase(PHASES.RUNNING);

  const emit = (stage) => (progress, total) =>
    onProgress({ stage, progress, total });

  onStageStart('exif');
  const photos = await stages.exif(files, {}, emit('exif'));
  onStageComplete('exif', photos);

  onStageStart('dedup');
  const dedupResult = await stages.dedup(photos, {}, emit('dedup'));
  onStageComplete('dedup', dedupResult);

  onStageStart('cluster');
  const clusterResult = await stages.cluster(dedupResult, {}, emit('cluster'));
  onStageComplete('cluster', clusterResult);

  onStageStart('heroSelect');
  const heroResult = await stages.heroSelect(
    clusterResult,
    { highlightDates: [] },
    emit('heroSelect'),
  );
  onStageComplete('heroSelect', heroResult);

  onStageStart('chapterBuilder');
  const chapterResult = await stages.chapterBuilder(
    heroResult,
    {},
    emit('chapterBuilder'),
  );
  onStageComplete('chapterBuilder', chapterResult);

  onStageStart('thumbnail');
  const thumbResult = await stages.thumbnail(
    chapterResult,
    {},
    emit('thumbnail'),
  );
  onStageComplete('thumbnail', thumbResult);

  onStageStart('qualityScore');
  const qualityResult = await stages.qualityScore(
    thumbResult,
    {},
    emit('qualityScore'),
  );
  onStageComplete('qualityScore', qualityResult);

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
      storyRunId: storyConfig.storyRunId,
      preferences: storyConfig.preferences,
    },
  );

  mm.revokeAll();
  onPhase(PHASES.DONE);

  return skeleton;
}

function noop() {}
