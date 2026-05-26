/**
 * Cover frame — the opening card of the slideshow.
 *
 * Holds indefinitely until the user taps the CTA. That tap is the MVP
 * handoff from wait → show: it satisfies mobile-autoplay restrictions
 * (music starts here in PR 2D), begins auto-advance, and marks the
 * state-machine transition idle → playing.
 *
 * Design intent: celebratory but calm. Big serif trip title, minimal
 * chrome, date range + stat as supporting detail. See PHASE-2-DESIGN-INTENT.md.
 */

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatDateRange(dateRange) {
  if (!dateRange?.start || !dateRange?.end) {
    return 'Undated';
  }

  const { start, end } = dateRange;
  const s = new Date(start + 'T00:00:00Z');
  const e = new Date(end + 'T00:00:00Z');
  const sameMonth =
    s.getUTCMonth() === e.getUTCMonth() && s.getUTCFullYear() === e.getUTCFullYear();
  const year = e.getUTCFullYear();
  if (sameMonth) {
    return `${MONTH_NAMES[s.getUTCMonth()]} ${s.getUTCDate()}–${e.getUTCDate()}, ${year}`;
  }
  return `${MONTH_NAMES[s.getUTCMonth()]} ${s.getUTCDate()} – ${MONTH_NAMES[e.getUTCMonth()]} ${e.getUTCDate()}, ${year}`;
}

export default function CoverFrame({ frame, onStart }) {
  const { tripName, dateRange, stat } = frame;

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center animate-fade-in">
      <p className="font-sans text-white/50 text-xs tracking-[0.3em] uppercase mb-6">
        {formatDateRange(dateRange)}
      </p>

      <h1 className="font-serif text-white text-5xl md:text-7xl font-semibold leading-[1.05] mb-8 max-w-2xl">
        {tripName}
      </h1>

      <div className="w-12 h-px bg-white/30 mx-auto mb-6" />

      <p className="font-sans text-white/70 text-sm tracking-wide mb-16">
        {stat.value}
      </p>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onStart?.();
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        className="group inline-flex items-center gap-3 px-6 py-3 rounded-full border border-white/40 bg-white/5 backdrop-blur-sm text-white text-sm tracking-wide uppercase hover:bg-white/15 transition-colors"
      >
        <span>Ready to relive your trip</span>
        <span aria-hidden className="inline-block transition-transform group-hover:translate-x-0.5">
          →
        </span>
      </button>
    </div>
  );
}
