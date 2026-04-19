import { useCallback, useRef, useState } from 'react';
import { PHASES, runPhase1 } from './pipeline/orchestrator.js';

/**
 * Phase 1 pipeline hook — drives the orchestrator and exposes reactive
 * state for the upload UI.
 *
 * Flow:
 *   start(files) → phase1a → surveyDates populated → awaiting_survey →
 *   (submitSurvey or skipSurvey) → phase1b → done (skeleton in `result`)
 *
 * The survey is a checkpoint: the orchestrator blocks in
 * `awaiting_survey` until one of `submitSurvey`/`skipSurvey` is called.
 * The modal is responsible for its own 60s timeout; on timeout it calls
 * skipSurvey().
 */
export function usePipeline() {
  const [phase, setPhase] = useState(PHASES.IDLE);
  const [progress, setProgress] = useState(null);
  const [surveyDates, setSurveyDates] = useState([]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  // Survey response is delivered through a deferred Promise created on each
  // `start()` call. We stash the resolver in a ref so `submitSurvey`/`skipSurvey`
  // can resolve it from outside the async flow.
  const surveyResolverRef = useRef(null);

  const start = useCallback(async (files) => {
    setPhase(PHASES.PHASE_1A);
    setProgress(null);
    setSurveyDates([]);
    setResult(null);
    setError(null);

    const surveyPromise = new Promise((resolve) => {
      surveyResolverRef.current = resolve;
    });

    try {
      const skeleton = await runPhase1(files, {
        onPhase: setPhase,
        onProgress: setProgress,
        onSurveyDates: setSurveyDates,
        getSurveyConfig: () => surveyPromise,
      });
      setResult(skeleton);
    } catch (err) {
      setError(err);
      setPhase(PHASES.ERROR);
    } finally {
      surveyResolverRef.current = null;
    }
  }, []);

  const submitSurvey = useCallback((config) => {
    const resolve = surveyResolverRef.current;
    if (resolve) {
      surveyResolverRef.current = null;
      resolve(config || {});
    }
  }, []);

  const skipSurvey = useCallback(() => {
    const resolve = surveyResolverRef.current;
    if (resolve) {
      surveyResolverRef.current = null;
      resolve({});
    }
  }, []);

  return {
    phase,
    progress,
    surveyDates,
    result,
    error,
    start,
    submitSurvey,
    skipSurvey,
  };
}

export { PHASES };
