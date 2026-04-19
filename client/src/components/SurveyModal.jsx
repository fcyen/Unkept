import { useEffect, useMemo, useRef, useState } from 'react';

const TIMEOUT_MS = 60_000;

/**
 * Survey modal — MVP has a single question:
 *   "Which day was your favourite?"  (multi-select from dates in EXIF)
 *
 * Behaviour (see IMPLEMENTATION-PLAN.md "Survey (parallel to Phase 1A)"):
 *   - Hidden entirely if only one unique date was found (single-day trip)
 *   - Skippable — skip and timeout both resolve with no highlightDates
 *   - 60s timeout proceeds with defaults
 *   - If Phase 1A finishes before the user submits, the modal shows a
 *     subtle "Almost ready" hint (via the `pipelineReady` prop)
 */
export default function SurveyModal({
  open,
  dates,
  pipelineReady = false,
  onSubmit,
  onSkip,
}) {
  const [selected, setSelected] = useState(() => new Set());
  const [secondsLeft, setSecondsLeft] = useState(Math.round(TIMEOUT_MS / 1000));
  const skipRef = useRef(onSkip);
  skipRef.current = onSkip;

  // Single-day trips: auto-skip once — there's nothing to ask.
  const skippable = dates.length > 1;

  useEffect(() => {
    if (!open) return;
    if (!skippable) {
      skipRef.current?.();
      return;
    }

    setSecondsLeft(Math.round(TIMEOUT_MS / 1000));

    const tickId = setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
    }, 1000);

    const timeoutId = setTimeout(() => {
      skipRef.current?.();
    }, TIMEOUT_MS);

    return () => {
      clearInterval(tickId);
      clearTimeout(timeoutId);
    };
  }, [open, skippable]);

  const formattedDates = useMemo(() => dates.map(formatDate), [dates]);

  if (!open || !skippable) return null;

  const toggle = (iso) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(iso)) next.delete(iso);
      else next.add(iso);
      return next;
    });
  };

  const submit = () => {
    onSubmit({ highlightDates: [...selected] });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 px-6">
      <div className="w-full max-w-md bg-cream border border-faint/40 p-8">
        <p className="font-sans text-xs tracking-[0.2em] uppercase text-faint mb-4">
          Quick question
        </p>
        <h2 className="font-serif text-2xl text-ink mb-2">
          Which day was your favourite?
        </h2>
        <p className="font-sans text-xs text-muted mb-6 leading-relaxed">
          Pick any that stood out. We&rsquo;ll lean on your choices when we pick
          the cover shots. Optional &mdash; feel free to skip.
        </p>

        <ul className="space-y-2 mb-6 max-h-64 overflow-y-auto">
          {dates.map((iso, i) => {
            const checked = selected.has(iso);
            return (
              <li key={iso}>
                <button
                  type="button"
                  onClick={() => toggle(iso)}
                  className={`w-full text-left px-4 py-3 border transition-colors font-sans text-sm ${
                    checked
                      ? 'border-ink bg-ink text-cream'
                      : 'border-faint/40 text-ink hover:border-ink/40'
                  }`}
                >
                  {formattedDates[i]}
                </button>
              </li>
            );
          })}
        </ul>

        {pipelineReady && (
          <p className="font-sans text-xs text-muted mb-4">
            Almost ready &mdash; finish your answers to continue.
          </p>
        )}

        <div className="flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={onSkip}
            className="font-sans text-xs text-muted hover:text-ink tracking-wide"
          >
            Skip ({secondsLeft}s)
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={selected.size === 0}
            className="px-6 py-2 border border-ink bg-ink text-cream font-sans text-xs tracking-widest uppercase hover:bg-ink/90 disabled:bg-faint disabled:border-faint disabled:text-cream/60 transition-colors"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

function formatDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
