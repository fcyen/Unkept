import { useEffect, useRef, useState } from 'react';

const TIMEOUT_MS = 60_000;
const DEFAULT_TARGET = 30;
const MIN_TARGET = 1;
const MAX_TARGET = 500;

/**
 * Pre-pipeline intake — captures trip name + target keep count while Phase 1
 * runs in the background. Two questions, both skippable; auto-submits with
 * current values after 60s of inactivity. The CTA in the host kicks off the
 * pipeline at the same time the survey opens, so the time the user spends
 * answering doubles as productive wait time.
 */
export default function Survey({ onSubmit }) {
  const [tripName, setTripName] = useState('');
  const [targetCount, setTargetCount] = useState(DEFAULT_TARGET);
  const submittedRef = useRef(false);

  const submit = () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    const cleanName = tripName.trim();
    const n = Number(targetCount);
    const cleanCount =
      Number.isFinite(n) && n >= MIN_TARGET
        ? Math.min(MAX_TARGET, Math.round(n))
        : null;
    onSubmit({
      tripName: cleanName || null,
      targetCount: cleanCount,
    });
  };

  // 60s safety net — proceed with whatever's typed (or defaults) if the user
  // walks away.
  useEffect(() => {
    const id = setTimeout(submit, TIMEOUT_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleKey = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-ink/40 px-6 py-10">
      <div className="max-w-sm w-full bg-cream border border-faint/40 p-8">
        <div className="text-center mb-6">
          <p className="font-sans text-[10px] tracking-[0.18em] uppercase text-muted mb-3">
            While we read your photos
          </p>
          <h2 className="font-serif text-2xl text-ink">
            Tell us about this trip
          </h2>
        </div>

        <label className="block mb-5">
          <span className="font-sans text-xs tracking-wide text-muted block mb-2">
            What was it?
          </span>
          <input
            type="text"
            autoFocus
            value={tripName}
            onChange={(e) => setTripName(e.target.value)}
            onKeyDown={handleKey}
            placeholder="e.g. Japan in spring"
            className="w-full border border-faint/60 bg-transparent px-3 py-2 font-serif text-lg text-ink placeholder:text-faint focus:outline-none focus:border-ink/60"
            maxLength={80}
          />
        </label>

        <label className="block mb-7">
          <span className="font-sans text-xs tracking-wide text-muted block mb-2">
            How many photos do you want in the end?
          </span>
          <input
            type="number"
            value={targetCount}
            min={MIN_TARGET}
            max={MAX_TARGET}
            onChange={(e) => setTargetCount(e.target.value)}
            onKeyDown={handleKey}
            className="w-full border border-faint/60 bg-transparent px-3 py-2 font-serif text-lg text-ink focus:outline-none focus:border-ink/60"
          />
          <span className="font-sans text-[11px] text-faint block mt-1">
            We&rsquo;ll spread that across each day.
          </span>
        </label>

        <button
          type="button"
          onClick={submit}
          className="w-full py-3 border border-ink bg-ink text-cream font-sans text-xs tracking-widest uppercase hover:bg-ink/90 transition-colors mb-2"
        >
          Continue
        </button>
        <button
          type="button"
          onClick={() => {
            setTripName('');
            setTargetCount('');
            submit();
          }}
          className="w-full font-sans text-[11px] text-muted hover:text-ink tracking-wide py-1"
        >
          Skip
        </button>
      </div>
    </div>
  );
}
