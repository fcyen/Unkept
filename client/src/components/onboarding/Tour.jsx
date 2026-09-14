import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './tour.css';
import { track } from '../../lib/analytics.js';
import { placeTooltip, spotlightRect, scrimPanels, SPOTLIGHT_PAD } from './tourPlacement.js';
import { visibleSteps, anchorExists } from './tourSteps.js';

// Re-measure this often while the tour is open. Anchors move for reasons we
// get no event for — the RightStrip scrolls itself to the current photo, the
// chapter rail scrolls horizontally, fonts finish loading — and a coach mark
// pointing at the wrong place is worse than none. A cheap rect read on a
// handful of elements is well inside frame budget.
const POLL_MS = 400;

function measure(selector) {
  if (!selector || typeof document === 'undefined') return null;
  const el = document.querySelector(`[data-tour="${selector}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

function sameRect(a, b) {
  if (!a || !b) return a === b;
  return Math.abs(a.top - b.top) < 0.5 && Math.abs(a.left - b.left) < 0.5
    && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5;
}

/**
 * Spotlight coach-mark tour.
 *
 * Steps name their anchor with a `data-tour="<id>"` attribute on the real
 * element, so the tour never duplicates layout knowledge — it reads the
 * geometry back off the DOM and re-reads it as things move. A step with no
 * anchor (or whose anchor has already been filtered out by `visibleSteps`)
 * renders as a centred card.
 *
 * The cut-out is left genuinely open rather than masked, so the user can try
 * the gesture a step describes without dismissing the tour first.
 *
 * @param {Array} steps    step definitions: { id, title, body, anchor?, placement?, padding? };
 *                         steps whose anchor is absent are dropped at mount
 * @param {string} surface telemetry label — 'upload' | 'curation'
 * @param {'paper'|'dark'} theme  matches the host screen's palette
 * @param {() => void} onClose  called on finish, skip, or Escape
 */
export default function Tour({ steps, surface, theme = 'paper', onClose }) {
  // Resolve once, at mount: the anchors present when the tour opens are the
  // ones it will talk about, so steps can't appear or vanish mid-walkthrough.
  const [resolved] = useState(() => visibleSteps(steps, anchorExists));
  const [index, setIndex] = useState(0);
  const [hole, setHole] = useState(null);
  const [pos, setPos] = useState(null);
  const [viewport, setViewport] = useState(() => ({
    width: typeof window === 'undefined' ? 0 : window.innerWidth,
    height: typeof window === 'undefined' ? 0 : window.innerHeight,
  }));
  const cardRef = useRef(null);
  const closedRef = useRef(false);

  const step = resolved[index];
  const total = resolved.length;
  const isLast = index === total - 1;

  const finish = useCallback((reason) => {
    if (closedRef.current) return;
    closedRef.current = true;
    track(reason === 'complete' ? 'tour_complete' : 'tour_skip', {
      surface,
      step: index + 1,
      steps: total,
    });
    onClose();
  }, [onClose, surface, index, total]);

  // One start event per tour, and one per step as the user moves through —
  // scalar counts only, in line with the telemetry guardrails.
  useEffect(() => {
    // Every anchor missing (an empty chapter rail, a stripped-down screen) —
    // nothing worth spotlighting, so close without showing an empty card.
    if (total === 0) { onClose(); return; }
    track('tour_start', { surface, steps: total });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (step) track('tour_step', { surface, step: index + 1, id: step.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  // Track the anchor's geometry: on step change, on resize/scroll, and on a
  // slow poll for the movements that raise no event.
  useLayoutEffect(() => {
    let raf = 0;
    const read = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      setViewport((prev) => (prev.width === vw && prev.height === vh ? prev : { width: vw, height: vh }));
      const rect = measure(step?.anchor);
      const next = rect
        ? spotlightRect(rect, { width: vw, height: vh }, step?.padding ?? SPOTLIGHT_PAD)
        : null;
      setHole((prev) => (sameRect(prev, next) ? prev : next));
    };
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(read);
    };

    read();
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    const poll = setInterval(read, POLL_MS);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(poll);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
    };
  }, [step?.anchor, step?.padding]);

  // Position the card once its own size is known. Measuring after paint means
  // the first frame of a step can be unpositioned, so the card stays hidden
  // (opacity 0) until `pos` exists.
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const size = { width: el.offsetWidth, height: el.offsetHeight };
    if (!size.width || !size.height) return;
    setPos(placeTooltip(hole, size, viewport, step?.placement || 'bottom'));
  }, [hole, viewport, index, step?.placement]);

  useEffect(() => {
    cardRef.current?.focus({ preventScroll: true });
  }, [index]);

  const next = useCallback(() => {
    if (isLast) finish('complete');
    else setIndex((i) => Math.min(total - 1, i + 1));
  }, [isLast, finish, total]);
  const prev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); finish('skip'); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [finish, next, prev]);

  if (!step || typeof document === 'undefined') return null;

  const panels = scrimPanels(hole, viewport);
  const titleId = `tour-title-${step.id}`;

  return createPortal(
    <div className="tour-root" data-theme={theme}>
      {panels.map((p, i) => (
        <div
          key={i}
          className="tour-scrim"
          style={{ top: p.top, left: p.left, width: p.width, height: p.height }}
          onClick={() => finish('skip')}
        />
      ))}

      {hole && (
        <div
          className="tour-ring"
          style={{ top: hole.top, left: hole.left, width: hole.width, height: hole.height }}
        />
      )}

      <div
        ref={cardRef}
        className="tour-card"
        data-placement={pos?.placement || 'center'}
        style={{
          top: pos ? pos.top : 0,
          left: pos ? pos.left : 0,
          visibility: pos ? 'visible' : 'hidden',
        }}
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="tour-count">{index + 1} / {total}</div>
        <h2 className="tour-title" id={titleId}>{step.title}</h2>
        <p className="tour-body">{step.body}</p>

        <div className="tour-actions">
          <div className="tour-dots" aria-hidden="true">
            {resolved.map((s, i) => (
              <span key={s.id} className="tour-dot" data-on={i <= index ? '1' : '0'} />
            ))}
          </div>
          <div className="tour-buttons">
            {index > 0 && (
              <button type="button" className="tour-btn ghost" onClick={prev}>Back</button>
            )}
            <button type="button" className="tour-btn primary" onClick={next}>
              {isLast ? 'Got it' : 'Next'}
            </button>
          </div>
        </div>

        <button
          type="button"
          className="tour-skip"
          onClick={() => finish('skip')}
        >
          {isLast ? 'Close' : 'Skip tour'}
        </button>
      </div>
    </div>,
    document.body,
  );
}
