/**
 * Segmented progress bar — one segment per frame.
 *
 * Hidden during normal playback; revealed when the user taps-to-pause.
 * Past segments are filled, the current segment animates its fill across
 * the frame's duration, and upcoming segments stay empty.
 */

export default function ProgressBar({
  frames,
  frameIndex,
  durationMs,
  visible,
  paused,
  runKey = 0,
}) {
  return (
    <div
      className={`absolute top-0 left-0 right-0 z-20 flex gap-1 px-3 pt-3 transition-opacity duration-300 pointer-events-none ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      {frames.map((_, i) => {
        const isPast = i < frameIndex;
        const isCurrent = i === frameIndex;
        return (
          <div
            key={i}
            className="flex-1 h-0.5 bg-white/20 overflow-hidden rounded-full"
          >
            {isPast && <div className="h-full w-full bg-white/80" />}
            {isCurrent && durationMs ? (
              <div
                className="h-full bg-white/80 origin-left"
                style={{
                  animation: `progressFill ${durationMs}ms linear forwards`,
                  animationPlayState: paused ? 'paused' : 'running',
                }}
                // runKey bumps on each resume so the CSS animation restarts
                // in lockstep with the advance timer — otherwise the bar can
                // finish while the timer still has seconds left.
                key={`${i}-${frameIndex}-${runKey}`}
              />
            ) : null}
            {isCurrent && !durationMs && (
              <div className="h-full w-0 bg-white/80" />
            )}
          </div>
        );
      })}
    </div>
  );
}
