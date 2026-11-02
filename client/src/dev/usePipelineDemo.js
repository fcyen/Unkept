import { useCallback, useEffect, useRef, useState } from 'react';
import { PHASES } from '../lib/pipeline/orchestrator.js';
import { STAGE_ORDER } from './usePipelineDebug.js';

/**
 * Demo-mode data source for the /pipeline inspector. Same interface as
 * usePipelineDebug, but reads the precomputed fixture instead of running the
 * pipeline — no files, no workers, no network beyond the static JSON.
 *
 * Stages are revealed one after another (a short beat each) so the timeline
 * reads as a pipeline; with prefers-reduced-motion they appear at once.
 *
 * `?preview=loading` holds the loading state and `?preview=error` forces the
 * fetch-failure state — used to check those states visually.
 */
const STEP_MS = 160;

function prefersReducedMotion() {
  try {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  } catch {
    return false;
  }
}

export function validateFixture(f) {
  if (!f || typeof f !== 'object') return 'Fixture is not a JSON object.';
  if (!f.snapshots || typeof f.snapshots !== 'object') return 'Fixture has no snapshots.';
  if (!f.snapshots.exif?.perPhoto) return 'Fixture is missing the EXIF stage.';
  return null;
}

export function usePipelineDemo(url) {
  const [phase, setPhase] = useState(PHASES.RUNNING);
  const [snapshots, setSnapshots] = useState({});
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);
  const [meta, setMeta] = useState(null);
  const imagesRef = useRef({});
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const timers = [];
    const preview = new URLSearchParams(window.location.search).get('preview');

    setPhase(PHASES.RUNNING);
    setSnapshots({});
    setError(null);
    setProgress({ stage: 'exif', progress: 0, total: 1 });

    if (preview === 'loading') return () => { cancelled = true; };

    (async () => {
      try {
        if (preview === 'error') throw new Error('Preview of the fixture load failure state.');
        const res = await fetch(url, { cache: 'no-cache' });
        if (!res.ok) throw new Error(`Couldn’t load the demo data (HTTP ${res.status}).`);
        const fixture = await res.json();
        const problem = validateFixture(fixture);
        if (problem) throw new Error(problem);
        if (cancelled) return;

        imagesRef.current = fixture.images ?? {};
        setMeta(fixture.meta ?? null);

        const order = STAGE_ORDER.filter((s) => fixture.snapshots[s]);
        const step = prefersReducedMotion() ? 0 : STEP_MS;
        if (step === 0) {
          setSnapshots(fixture.snapshots);
          setProgress(null);
          setPhase(PHASES.DONE);
          return;
        }
        order.forEach((stage, i) => {
          timers.push(setTimeout(() => {
            if (cancelled) return;
            setSnapshots((prev) => ({ ...prev, [stage]: fixture.snapshots[stage] }));
            const nextStage = order[i + 1];
            setProgress(nextStage ? { stage: nextStage, progress: 0, total: 1 } : null);
            if (!nextStage) setPhase(PHASES.DONE);
          }, step * (i + 1)));
        });
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setPhase(PHASES.ERROR);
        setProgress(null);
      }
    })();

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [url, attempt]);

  const getPreviewUrl = useCallback((id) => imagesRef.current[id] ?? null, []);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { phase, progress, snapshots, error, getPreviewUrl, retry, meta };
}
