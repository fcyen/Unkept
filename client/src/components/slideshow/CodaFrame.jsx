/**
 * Coda frame — closes the slideshow.
 *
 * Plays for ~5s after the last chapter, then holds indefinitely (the
 * state machine transitions to 'finished'). The play-again button is
 * the only affordance; it resets to the cover.
 *
 * Copy is "The end." for MVP — more variety is post-MVP. See
 * PHASE-2-DESIGN-INTENT.md §Decisions locked.
 */

export default function CodaFrame({ frame, finished, onReplay }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center animate-fade-in">
      <p className="font-serif italic text-white text-5xl md:text-6xl mb-10">
        {frame.text ?? 'The end.'}
      </p>

      <div className="w-12 h-px bg-white/30 mx-auto mb-10" />

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onReplay?.();
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        className={`inline-flex items-center gap-3 px-5 py-2.5 rounded-full border border-white/40 bg-white/5 text-white text-sm tracking-wide uppercase hover:bg-white/15 transition-colors ${
          finished ? 'opacity-100' : 'opacity-0'
        } duration-500`}
        aria-hidden={!finished}
      >
        <span aria-hidden>↺</span>
        <span>Play again</span>
      </button>
    </div>
  );
}
