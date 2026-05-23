import { useEffect, useRef } from 'react';
import PhotoTile from './PhotoTile.jsx';

// BottomStrip — kept photos across every chapter, split by vertical dividers
// so the user always sees their full selection at a glance. The current
// chapter is rendered at full opacity; the others sit muted as context. Drag
// landing only highlights the active chapter, since drops always land there.
const SLOT = 48;
const SLOT_GAP = 7;
const CHAPTER_GAP = 12;

export default function BottomStrip({
  chapters, currentChapterId, dropActive, currentKept, onSlotClick,
}) {
  const totalFilled = chapters.reduce((s, c) => s + c.kept.length, 0);
  const totalTarget = chapters.reduce((s, c) => s + c.target, 0);

  // Keep the current chapter's slots in view as the user moves between days.
  const scrollerRef = useRef(null);
  const currentRef = useRef(null);
  useEffect(() => {
    const scroller = scrollerRef.current;
    const node = currentRef.current;
    if (!scroller || !node) return;
    const sRect = scroller.getBoundingClientRect();
    const nRect = node.getBoundingClientRect();
    const offset = (nRect.left - sRect.left)
      - (sRect.width - nRect.width) / 2
      + scroller.scrollLeft;
    scroller.scrollTo({ left: Math.max(0, offset), behavior: 'smooth' });
  }, [currentChapterId, totalFilled]);

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
          {totalFilled}<span style={{ color: 'var(--paper-dim)' }}>/{totalTarget}</span>
        </div>
        <div style={{
          fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase',
          color: 'var(--paper-dim)', marginTop: 3,
        }}>kept</div>
      </div>

      <div
        ref={scrollerRef}
        style={{
          flex: 1, minWidth: 0,
          display: 'flex', alignItems: 'center',
          overflowX: 'auto', overflowY: 'hidden',
          scrollbarWidth: 'none',
          paddingBottom: 2, paddingTop: 2,
        }}
      >
        {chapters.map((c, ci) => {
          const isCurrent = c.id === currentChapterId;
          const filled = c.kept.length;
          const slots = Math.max(c.target, filled);
          const items = Array.from({ length: slots }, (_, i) => c.kept[i] || null);
          const landingIdx = items.findIndex((x) => x === null);

          return (
            <div
              key={c.id}
              ref={isCurrent ? currentRef : null}
              style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}
            >
              {ci > 0 && (
                <div
                  aria-hidden
                  style={{
                    width: 1, height: SLOT, flexShrink: 0,
                    margin: `0 ${CHAPTER_GAP}px`,
                    background: 'rgba(244, 239, 230, 0.22)',
                  }}
                />
              )}
              <div style={{
                display: 'flex', gap: SLOT_GAP, flexShrink: 0,
                opacity: isCurrent ? 1 : 0.55,
                transition: 'opacity 200ms ease',
              }}>
                {items.map((p, i) => {
                  const isExtra = i >= c.target;
                  const isLanding = isCurrent && dropActive && i === landingIdx;
                  if (p) {
                    const isCurrentKept = currentKept === p.id;
                    return (
                      <div key={p.id} style={{ position: 'relative', flexShrink: 0 }}>
                        <PhotoTile
                          photo={p}
                          size={SLOT}
                          kept
                          showMark={false}
                          onClick={() => onSlotClick && onSlotClick(p, c.id)}
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
        })}
      </div>
    </div>
  );
}
