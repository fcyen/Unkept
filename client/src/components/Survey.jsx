import { useState } from 'react';

const MIN_TARGET = 1;
const DEFAULT_TARGET = 30;

/**
 * Pre-pipeline intake — captures trip name + target keep count while Phase 1
 * runs in the background. One question per slide; both are required (the
 * survey is not skippable) so the time the user spends answering doubles as
 * productive wait time. The host kicks off the pipeline the moment this opens.
 *
 * @param {(responses: { tripName: string, targetCount: number }) => void} onSubmit
 * @param {number} photoCount - number of photos uploaded; caps the target count
 */
export default function Survey({ onSubmit, photoCount }) {
  const maxTarget = Math.max(MIN_TARGET, photoCount || MIN_TARGET);

  const [step, setStep] = useState(0);
  const [tripName, setTripName] = useState('');
  const [targetCount, setTargetCount] = useState(
    String(Math.min(DEFAULT_TARGET, maxTarget)),
  );

  const trimmedName = tripName.trim();
  const nameValid = trimmedName.length > 0;

  const n = Number(targetCount);
  const countValid =
    targetCount !== '' &&
    Number.isInteger(n) &&
    n >= MIN_TARGET &&
    n <= maxTarget;

  // Per-field error copy, only shown once the user has typed something invalid.
  const countError =
    targetCount === '' || countValid
      ? ''
      : n > maxTarget
        ? `You only uploaded ${maxTarget} photo${maxTarget === 1 ? '' : 's'}.`
        : `Pick a number between ${MIN_TARGET} and ${maxTarget}.`;

  const advance = () => {
    if (step === 0) {
      if (!nameValid) return;
      setStep(1);
      return;
    }
    if (!countValid) return;
    onSubmit({ tripName: trimmedName, targetCount: n });
  };

  const handleKey = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      advance();
    }
  };

  const onLastStep = step === 1;
  const canAdvance = onLastStep ? countValid : nameValid;

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-ink/40 px-6 py-10">
      <div className="max-w-sm w-full bg-cream border border-faint/40 p-8">
        <div className="flex items-center justify-center gap-1.5 mb-6">
          {[0, 1].map((i) => (
            <span
              key={i}
              className={`h-1 w-6 rounded-full transition-colors ${
                i <= step ? 'bg-ink' : 'bg-faint/50'
              }`}
            />
          ))}
        </div>

        <div className="text-center mb-6">
          <p className="font-sans text-[10px] tracking-[0.18em] uppercase text-muted mb-3">
            While we read your photos
          </p>
          <h2 className="font-serif text-2xl text-ink">
            {step === 0 ? 'What was this trip?' : 'How many photos do you want?'}
          </h2>
        </div>

        {step === 0 ? (
          <label className="block mb-7">
            <span className="font-sans text-xs tracking-wide text-muted block mb-2">
              Give it a name
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
        ) : (
          <label className="block mb-7">
            <span className="font-sans text-xs tracking-wide text-muted block mb-2">
              We&rsquo;ll spread that across each day
            </span>
            <input
              type="number"
              autoFocus
              value={targetCount}
              min={MIN_TARGET}
              max={maxTarget}
              onChange={(e) => setTargetCount(e.target.value)}
              onKeyDown={handleKey}
              className={`w-full border bg-transparent px-3 py-2 font-serif text-lg text-ink focus:outline-none ${
                countError
                  ? 'border-red-400 focus:border-red-500'
                  : 'border-faint/60 focus:border-ink/60'
              }`}
            />
            <span className="font-sans text-[11px] block mt-1.5">
              {countError ? (
                <span className="text-red-600">{countError}</span>
              ) : (
                <span className="text-faint">
                  {maxTarget} photo{maxTarget === 1 ? '' : 's'} to choose from.
                </span>
              )}
            </span>
          </label>
        )}

        <button
          type="button"
          onClick={advance}
          disabled={!canAdvance}
          className="w-full py-3 border border-ink bg-ink text-cream font-sans text-xs tracking-widest uppercase hover:bg-ink/90 disabled:bg-faint disabled:border-faint disabled:text-cream/60 transition-colors"
        >
          {onLastStep ? 'Start curating' : 'Continue'}
        </button>

        {onLastStep && (
          <button
            type="button"
            onClick={() => setStep(0)}
            className="w-full font-sans text-[11px] text-muted hover:text-ink tracking-wide py-2 mt-1"
          >
            Back
          </button>
        )}
      </div>
    </div>
  );
}
