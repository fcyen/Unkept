import { useCallback, useState } from 'react';
import { PHASES, runPhase1 } from './pipeline/orchestrator.js';

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

    try {
      const skeleton = await runPhase1(files, {
        onPhase: setPhase,
        onProgress: setProgress,
      });
      setResult(skeleton);
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
