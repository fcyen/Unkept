/**
 * Photo card frame — one of five layouts chosen by storyBuilder.
 *
 *   landscape-3   3 landscape photos stacked; flip-from-top entry
 *   portrait-4    2×2 grid of portraits; flip-from-left, staggered
 *   mixed-2p-1l   2 portraits on top, 1 landscape below
 *   landscape-2   2 landscape photos stacked
 *   portrait-1    single portrait, full-frame fallback
 *
 * Photos animate in with staggered delays so the frame feels composed
 * rather than loaded. Duration: ~4.5s (owner: SlideshowPlayer).
 *
 * When the user opts into AI captions (PR 3A), a `caption` string is
 * passed in and rendered as a bottom overlay on top of the layout —
 * see PHASE-2-DESIGN-INTENT.md "Decisions locked" #5.
 */

export default function PhotoCardFrame({ frame, photos, caption, captionError }) {
  const { layout, photoIds } = frame;
  const items = photoIds.map((id) => photos[id]).filter(Boolean);

  let layoutEl;
  switch (layout) {
    case 'landscape-3':
      layoutEl = <Landscape3 items={items} />;
      break;
    case 'portrait-4':
      layoutEl = <Portrait4 items={items} />;
      break;
    case 'mixed-2p-1l':
      layoutEl = <Mixed2p1l items={items} frame={frame} />;
      break;
    case 'landscape-2':
      layoutEl = <Landscape2 items={items} />;
      break;
    case 'portrait-1':
    default:
      layoutEl = <Portrait1 items={items} />;
  }

  return (
    <>
      {layoutEl}
      <CaptionOverlay text={caption} error={captionError} />
    </>
  );
}

function CaptionOverlay({ text, error }) {
  // Skip rendering entirely until the first delta arrives, so frames
  // without captions look identical to the pre-3A behaviour. The
  // wrapper fades in on first mount; subsequent deltas update the
  // text in place so streaming reads as "typewriter" not "blink".
  if (!text && !error) return null;
  return (
    <div className="absolute inset-x-0 bottom-0 z-20 pt-16 pb-6 px-5 bg-gradient-to-t from-black/85 via-black/55 to-transparent pointer-events-none animate-fade-in">
      {error ? (
        <p className="font-sans text-xs text-red-300/80">{error}</p>
      ) : (
        <p className="font-serif text-white text-base md:text-lg leading-snug">
          {text}
        </p>
      )}
    </div>
  );
}

// --- Layouts ---------------------------------------------------------------

function Landscape3({ items }) {
  return (
    <div className="absolute inset-0 grid grid-rows-3 gap-1 bg-black p-1">
      {items.slice(0, 3).map((p, i) => (
        <Cell key={p.id} photo={p} animation="flip-top" delayMs={i * 280} />
      ))}
    </div>
  );
}

// Visual reveal order: TL → BR → TR → BL. Cells are rendered in row-major
// (TL, TR, BL, BR); this table maps each cell's grid position to its place
// in the staggered sequence.
const PORTRAIT_4_ORDER = [0, 2, 3, 1];

function Portrait4({ items }) {
  return (
    <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-1 bg-black p-1">
      {items.slice(0, 4).map((p, i) => (
        <Cell
          key={p.id}
          photo={p}
          animation="flip-left"
          delayMs={PORTRAIT_4_ORDER[i] * 240}
        />
      ))}
    </div>
  );
}

function Mixed2p1l({ items, frame }) {
  // storyBuilder fills photoIds so that — for landscape heroes — the landscape
  // is the third entry. For portrait heroes the hero leads. Either way, the
  // first two items go to the top row and the third to the bottom.
  const [top1, top2, bottom] = items;
  return (
    <div
      className="absolute inset-0 grid gap-1 bg-black p-1"
      style={{ gridTemplateRows: '3fr 2fr' }}
    >
      <div className="grid grid-cols-2 gap-1">
        {top1 && <Cell photo={top1} animation="flip-left" delayMs={0} />}
        {top2 && <Cell photo={top2} animation="flip-left" delayMs={240} />}
      </div>
      {bottom && <Cell photo={bottom} animation="flip-top" delayMs={480} />}
    </div>
  );
}

function Landscape2({ items }) {
  return (
    <div className="absolute inset-0 grid grid-rows-2 gap-1 bg-black p-1">
      {items.slice(0, 2).map((p, i) => (
        <Cell key={p.id} photo={p} animation="flip-top" delayMs={i * 320} />
      ))}
    </div>
  );
}

function Portrait1({ items }) {
  const p = items[0];
  if (!p) return null;
  return (
    <div className="absolute inset-0 bg-black p-1">
      <Cell photo={p} animation="fade-up" delayMs={0} />
    </div>
  );
}

// --- Cell ------------------------------------------------------------------

function Cell({ photo, animation, delayMs }) {
  const src = photo.thumbnailHeroUrl || photo.thumbnailUrl;
  const cls = {
    'flip-top': 'animate-flip-top',
    'flip-left': 'animate-flip-left',
    'fade-up': 'animate-fade-up',
  }[animation];

  return (
    <div
      className={`relative overflow-hidden bg-neutral-900 ${cls}`}
      style={{
        animationDelay: `${delayMs}ms`,
        animationFillMode: 'both',
      }}
    >
      {photo.thumbnailFailed ? (
        <div className="w-full h-full flex items-center justify-center text-white/30 text-xs font-sans">
          {photo.name}
        </div>
      ) : (
        <img src={src} alt="" className="w-full h-full object-cover" />
      )}
    </div>
  );
}
