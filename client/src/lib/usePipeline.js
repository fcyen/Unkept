import { useCallback, useState } from 'react';
import { PHASES, runPhase1 } from './pipeline/orchestrator.js';
import { track } from './analytics.js';

/**
 * Phase 1 pipeline hook — drives the orchestrator and exposes reactive
 * state for the upload UI.
 */
export function usePipeline() {
  const [phase, setPhase] = useState(PHASES.IDLE);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const start = useCallback(async (files) => {
    setPhase(PHASES.RUNNING);
    setProgress(null);
    setResult(null);
    setError(null);

    // Per-stage wall-clock timing, emitted as one `pipeline_stage_duration`
    // event ({ exif: ms, dedup: ms, … }) so we can see which stage bottlenecks
    // on real collections, not just our fixtures.
    const stageStartedAt = {};
    const stageDurations = {};

    try {
      const skeleton = await runPhase1(files, {
        onPhase: setPhase,
        onProgress: setProgress,
        onStageStart: (stage) => { stageStartedAt[stage] = performance.now(); },
        onStageComplete: (stage) => {
          if (stageStartedAt[stage] != null) {
            stageDurations[stage] = Math.round(performance.now() - stageStartedAt[stage]);
          }
        },
      });
      setResult(skeleton);
      track('pipeline_stage_duration', stageDurations);
    } catch (err) {
      setError(err);
      setPhase(PHASES.ERROR);
    }
  }, []);

  return {
    phase,
    progress,
    result,
    error,
    start,
  };
}

export { PHASES };
