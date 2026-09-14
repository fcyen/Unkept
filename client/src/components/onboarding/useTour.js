import { useCallback, useEffect, useState } from 'react';
import { FEATURES } from '../../config.js';
import { shouldShowTour, markTourSeen } from './tourState.js';

/**
 * Owns the open/closed state for one surface's tour.
 *
 * Auto-starts once per device (per step version) when `ready` is true, and
 * exposes `start()` so a "How it works" button can replay it at any time.
 * Closing for any reason marks the surface seen, so a user who skips isn't
 * shown it again on the next run.
 *
 * @param {string} surface 'upload' | 'curation'
 * @param {{ ready?: boolean, delayMs?: number }} [options]
 *   ready   - gate auto-start until the surface is actually rendered and
 *             its anchors exist (default true)
 *   delayMs - wait before auto-starting, so the screen's own entrance
 *             settles and the anchors have their final geometry
 */
export default function useTour(surface, { ready = true, delayMs = 500 } = {}) {
  const [open, setOpen] = useState(false);
  // Auto-start is a one-shot per mount: once the tour has opened (or been
  // opened manually) we never re-trigger it from the effect below.
  const [autoStarted, setAutoStarted] = useState(false);

  useEffect(() => {
    if (!FEATURES.onboardingTour) return undefined;
    if (!ready || autoStarted) return undefined;
    if (!shouldShowTour(surface)) return undefined;

    const id = setTimeout(() => {
      setAutoStarted(true);
      setOpen(true);
    }, delayMs);
    return () => clearTimeout(id);
  }, [surface, ready, autoStarted, delayMs]);

  const start = useCallback(() => {
    setAutoStarted(true);
    setOpen(true);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    markTourSeen(surface);
  }, [surface]);

  return { open, start, close, enabled: FEATURES.onboardingTour };
}
