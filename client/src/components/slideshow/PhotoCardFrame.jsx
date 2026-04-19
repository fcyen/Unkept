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
 * Captions are out of MVP — text lives on chapter dividers only.
 * See PHASE-2-DESIGN-INTENT.md.
 */

export default function PhotoCardFrame({ frame, photos }) {
  const { layout, photoIds } = frame;
  const items = photoIds.map((id) => photos[id]).filter(Boolean);

  switch (layout) {
    case 'landscape-3':
      return <Landscape3 items={items} />;
    case 'portrait-4':
      return <Portrait4 items={items} />;
    case 'mixed-2p-1l':
      return <Mixed2p1l items={items} frame={frame} />;
    case 'landscape-2':
      return <Landscape2 items={items} />;
    case 'portrait-1':
    default:
      return <Portrait1 items={items} />;
  }
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

function Portrait4({ items }) {
  return (
    <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-1 bg-black p-1">
      {items.slice(0, 4).map((p, i) => (
        <Cell key={p.id} photo={p} animation="flip-left" delayMs={i * 240} />
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
