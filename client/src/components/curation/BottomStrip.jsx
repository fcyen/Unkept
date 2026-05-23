import PhotoTile from './PhotoTile.jsx';

// BottomStrip — kept photos for the current chapter as slots that fill in.
const SLOT = 48;
const SLOT_GAP = 7;

export default function BottomStrip({ kept, target, dropActive, currentKept, onSlotClick }) {
  const filled = kept.length;
  const slots = Math.max(target, filled);
  const items = Array.from({ length: slots }, (_, i) => kept[i] || null);
  const landingIdx = items.findIndex((x) => x === null);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
        minWidth: 38, flexShrink: 0,
      }}>
        <div className="mono" style={{
          fontSize: 18, lineHeight: 1, letterSpacing: '-0.02em',
          color: 'var(--paper)',
        }}>
          {filled}<span style={{ color: 'var(--paper-dim)' }}>/{target}</span>
        </div>
        <div style={{
          fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase',
          color: 'var(--paper-dim)', marginTop: 3,
        }}>kept</div>
      </div>

      <div style={{
        flex: 1, minWidth: 0,
        display: 'flex', gap: SLOT_GAP,
        overflowX: 'auto', overflowY: 'hidden',
        scrollbarWidth: 'none',
        paddingBottom: 2, paddingTop: 2,
      }}>
        {items.map((p, i) => {
          const isExtra = i >= target;
          const isLanding = dropActive && i === landingIdx;
          if (p) {
            const isCurrentKept = currentKept === p.id;
            return (
              <div key={p.id} style={{ position: 'relative', flexShrink: 0 }}>
                <PhotoTile
                  photo={p}
                  size={SLOT}
                  kept
                  showMark={false}
                  onClick={() => onSlotClick && onSlotClick(p)}
                  style={{
                    borderRadius: 8,
                    transform: isCurrentKept ? 'translateY(-3px)' : 'none',
                    transition: 'transform 200ms cubic-bezier(.3,.7,.4,1)',
                    boxShadow: isCurrentKept ? '0 6px 14px rgba(0,0,0,0.45)' : 'none',
                  }}
                />
                {isExtra && (
                  <div style={{
                    position: 'absolute', top: -4, right: -4,
                    background: 'var(--warm)', color: '#1A1714',
                    fontSize: 9, fontWeight: 700,
                    width: 14, height: 14, borderRadius: 50,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>+</div>
                )}
              </div>
            );
          }
          return (
            <div
              key={'e' + i}
              style={{
                width: SLOT, height: SLOT, borderRadius: 8, flexShrink: 0,
                border: '1px solid ' + (isLanding ? 'var(--accent)' : 'var(--line)'),
                background: isLanding ? 'rgba(255,106,44,0.10)' : 'transparent',
                transition: 'background 160ms ease, border-color 160ms ease, transform 160ms ease',
                transform: isLanding ? 'scale(1.06)' : 'scale(1)',
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
