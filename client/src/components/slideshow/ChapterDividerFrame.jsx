/**
 * Chapter divider frame — 3-row layout (photo / text / photo).
 *
 * Design intent: the breath between chapters. Two photos bracket the
 * text band. The photos are already in place when the frame starts;
 * only the text flies in. This lets the divider feel like a transition
 * rather than a new scene. See archived_docs/PHASE-2-DESIGN-INTENT.md.
 *
 * Entry:   text fly-up from below the band (~300ms)
 * Exit:    top photo slides left, bottom photo slides right (~400ms)
 * Duration: ~3s (owner: SlideshowPlayer)
 */

export default function ChapterDividerFrame({ frame, photos, exiting }) {
  const { dayIndex, title, location, topPhotoId, bottomPhotoId } = frame;
  const top = photos[topPhotoId];
  const bottom = photos[bottomPhotoId];

  const locationLabel = location?.label ?? null;

  return (
    <div className="absolute inset-0 grid grid-rows-[1fr_auto_1fr] bg-black">
      <div className="overflow-hidden">
        {top && (
          <img
            src={top.thumbnailHeroUrl || top.thumbnailUrl}
            alt=""
            className={`w-full h-full object-cover transition-transform duration-[400ms] ease-[cubic-bezier(0.65,0,0.35,1)] ${
              exiting ? '-translate-x-full' : 'translate-x-0'
            }`}
          />
        )}
      </div>

      <div className="relative py-8 px-8 bg-black text-center overflow-hidden">
        <div className={`${exiting ? 'opacity-0' : 'animate-fly-up'}`}>
          <p className="font-sans text-white/50 text-xs tracking-[0.3em] uppercase mb-3">
            Day {dayIndex}
          </p>
          <h2 className="font-serif text-white text-3xl md:text-5xl font-semibold leading-tight">
            {stripDayPrefix(title, dayIndex)}
          </h2>
          {locationLabel && (
            <p className="font-sans text-white/60 text-sm mt-3 tracking-wide">
              {locationLabel}
            </p>
          )}
        </div>
      </div>

      <div className="overflow-hidden">
        {bottom && (
          <img
            src={bottom.thumbnailHeroUrl || bottom.thumbnailUrl}
            alt=""
            className={`w-full h-full object-cover transition-transform duration-[400ms] ease-[cubic-bezier(0.65,0,0.35,1)] ${
              exiting ? 'translate-x-full' : 'translate-x-0'
            }`}
          />
        )}
      </div>
    </div>
  );
}

// Title is already "Day N" or "Day N — <place>". The day number appears
// in the kicker above, so drop it from the heading to avoid doubling.
function stripDayPrefix(title, dayIndex) {
  if (!title) return '';
  const prefix = `Day ${dayIndex}`;
  if (!title.startsWith(prefix)) return title;
  const rest = title.slice(prefix.length).replace(/^\s*[—–-]\s*/, '').trim();
  return rest || title;
}
