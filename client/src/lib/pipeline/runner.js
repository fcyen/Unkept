/**
 * Pipeline runner — chains processing stages in order, emitting progress events.
 *
 * Each stage is a function: (input, options, onProgress) => output
 * The runner passes the output of one stage as input to the next.
 *
 * Supports checkpoints: the pipeline can pause at a named checkpoint,
 * wait for external input (e.g. survey responses), then resume with
 * the merged config.
 */

/**
 * @param {Array<{ name: string, fn: Function, options?: object }>} stages
 * @param {*} initialInput - input to the first stage
 * @param {(event: { stage: string, stageIndex: number, totalStages: number, progress: number, total: number }) => void} onProgress
 * @returns {Promise<*>} - output of the last stage
 */
export async function runPipeline(stages, initialInput, onProgress) {
  let data = initialInput;
  const totalStages = stages.length;

  for (let i = 0; i < stages.length; i++) {
    const { name, fn, options = {} } = stages[i];

    const stageProgress = (progress, total) => {
      if (onProgress) {
        onProgress({ stage: name, stageIndex: i, totalStages, progress, total });
      }
    };

    data = await fn(data, options, stageProgress);
  }

  return data;
}

/**
 * Pipeline runner with checkpoint support.
 *
 * Divides stages into phases separated by checkpoints. At each checkpoint,
 * the runner pauses and calls the checkpoint handler with the current data.
 * The handler returns additional config that gets merged into subsequent stages.
 *
 * @param {{ phases: Phase[], initialInput: *, onProgress: Function, onCheckpoint: Function }} config
 *
 * Phase: { name: string, stages: Stage[] }
 * Stage: { name: string, fn: Function, options?: object }
 *
 * onCheckpoint: (phaseName: string, data: *) => Promise<object>
 *   Called between phases. Returns config to merge into next phase's stage options.
 */
export async function runPipelineWithCheckpoints({ phases, initialInput, onProgress, onCheckpoint }) {
  let data = initialInput;
  let mergedConfig = {};

  let stageIndex = 0;
  const totalStages = phases.reduce((sum, p) => sum + p.stages.length, 0);

  for (let phaseIdx = 0; phaseIdx < phases.length; phaseIdx++) {
    const phase = phases[phaseIdx];

    for (const stage of phase.stages) {
      const combinedOptions = { ...stage.options, ...mergedConfig };

      const stageProgress = (progress, total) => {
        if (onProgress) {
          onProgress({
            phase: phase.name,
            stage: stage.name,
            stageIndex,
            totalStages,
            progress,
            total,
          });
        }
      };

      data = await stage.fn(data, combinedOptions, stageProgress);
      stageIndex++;
    }

    // Checkpoint between phases (except after the last phase)
    if (phaseIdx < phases.length - 1 && onCheckpoint) {
      const checkpointConfig = await onCheckpoint(phase.name, data);
      if (checkpointConfig && typeof checkpointConfig === 'object') {
        mergedConfig = { ...mergedConfig, ...checkpointConfig };
      }
    }
  }

  return data;
}

/**
 * Assemble a Story Skeleton from pipeline output.
 * Strips File references and produces the final serialisable JSON.
 *
 * @param {{ chapters: Chapter[], photos: Map<string, PhotoData>, burstGroups?: BurstGroup[] }} pipelineOutput
 * @param {{ totalPhotosInput: number, totalPhotosAfterDedup: number, storyRunId?: string, preferences?: object, surveyResponses?: object }} meta
 * @returns {object} Story Skeleton
 */
export function assembleSkeleton(pipelineOutput, meta) {
  const { chapters, photos } = pipelineOutput;
  const burstGroups = pipelineOutput.burstGroups || [];

  // Build photos map (strip File references, ensure serialisable)
  const photosMap = {};
  for (const [id, photo] of photos) {
    photosMap[id] = {
      id: photo.id,
      name: photo.name,
      timestamp: photo.timestamp || null,
      coords: photo.coords || null,
      thumbnailUrl: photo.thumbnailUrl || null,
      thumbnailHeroUrl: photo.thumbnailHeroUrl || null,
      thumbnailFailed: photo.thumbnailFailed || false,
      qualityScore: photo.qualityScore ?? null,
      faces: photo.faces ?? null,
    };
  }

  // Compute date range
  const timestamps = [...photos.values()]
    .map((p) => p.timestamp)
    .filter(Boolean)
    .sort();

  const dateRange = timestamps.length > 0
    ? { start: timestamps[0].split('T')[0], end: timestamps[timestamps.length - 1].split('T')[0] }
    : null;

  return {
    version: '1.0',
    generatedAt: new Date().toISOString(),
    photos: photosMap,
    chapters: chapters.map((ch) => ({
      id: ch.id,
      photoIds: ch.photoIds,
      heroPhotoId: ch.heroPhotoId,
      date: ch.date,
      coords: ch.coords,
    })),
    burstGroups: burstGroups.map((g) => ({
      representativeId: g.representativeId,
      candidateIds: [...g.candidateIds],
    })),
    meta: {
      totalPhotosInput: meta.totalPhotosInput,
      totalPhotosAfterDedup: meta.totalPhotosAfterDedup ?? photos.size,
      totalChapters: chapters.length,
      dateRange,
      storyRunId: meta.storyRunId || null,
      preferences: meta.preferences || {},
      surveyResponses: meta.surveyResponses || {},
    },
  };
}
