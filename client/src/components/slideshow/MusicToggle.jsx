/**
 * Music toggle button — shown in the controls overlay (i.e. when the
 * slideshow is paused). Persists the user preference via
 * `useSlideshowMusic`'s localStorage write.
 *
 * Stops pointer events from bubbling so tapping the button doesn't
 * register as a tap-to-prev / tap-to-next on the underlying slideshow.
 */

const SPEAKER_ON = (
  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 5L6 9H3v6h3l5 4V5z" />
    <path d="M15.5 8.5a5 5 0 010 7" />
    <path d="M18.5 5.5a9 9 0 010 13" />
  </svg>
);

const SPEAKER_OFF = (
  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 5L6 9H3v6h3l5 4V5z" />
    <path d="M22 9l-6 6" />
    <path d="M16 9l6 6" />
  </svg>
);

export default function MusicToggle({ enabled, onToggle, visible }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      className={`absolute top-3 right-14 z-30 inline-flex items-center justify-center w-9 h-9 rounded-full bg-black/40 text-white/80 hover:text-white hover:bg-black/60 transition-opacity duration-300 ${
        visible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
      aria-label={enabled ? 'Mute music' : 'Unmute music'}
      aria-pressed={enabled}
    >
      {enabled ? SPEAKER_ON : SPEAKER_OFF}
    </button>
  );
}
