import { Fragment } from 'react';
import PhotoTile from './PhotoTile.jsx';

// BottomStrip — kept photos across every chapter, grouped by chapter and
// separated by a vertical divider. The current chapter additionally renders
// empty slots up to its target so the drop-to-keep affordance stays visible
// while dragging.
const SLOT = 48;
const SLOT_GAP = 7;
const SECTION_GAP = 12;

export default function BottomStrip({
  chapters,
  keptPhotosByChapter,
  currentChapterId,
  dropActive,
  currentKept,
  onSlotClick,
}) {
  const totalFilled = chapters.reduce(
    (s, c) => s + (keptPhotosByChapter[c.id]?.length || 0), 0,
  );
  const totalTarget = chapters.reduce((s, c) => s + c.target, 0);

  // Skip non-current chapters that have nothing kept yet — they'd contribute
  // a divider with no content. The current chapter always renders so the
  // landing slots stay anchored.
  const sections = chapters
    .map((ch) => {
      const isCurrent = ch.id === currentChapterId;
      const filled = keptPhotosByChapter[ch.id] || [];
      const slotCount = isCurrent ? Math.max(ch.target, filled.length) : filled.length;
      return { ch, isCurrent, filled, slotCount };
    })
    .filter((s) => s.slotCount > 0);

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

      <div style={{
        flex: 1, minWidth: 0,
        display: 'flex', alignItems: 'center', gap: SECTION_GAP,
        overflowX: 'auto', overflowY: 'hidden',
        scrollbarWidth: 'none',
        paddingBottom: 2, paddingTop: 2,
      }}>
        {sections.map(({ ch, isCurrent, filled, slotCount }, sIdx) => {
          const items = Array.from({ length: slotCount }, (_, i) => filled[i] || null);
          const landingIdx = items.findIndex((x) => x === null);
          return (
            <Fragment key={ch.id}>
              {sIdx > 0 && (
                <div style={{
                  width: 1, height: SLOT,
                  background: 'var(--line)', flexShrink: 0,
                }} />
              )}
              <div style={{ display: 'flex', gap: SLOT_GAP, flexShrink: 0 }}>
                {items.map((p, i) => {
                  const isExtra = isCurrent && i >= ch.target;
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
                          onClick={() => onSlotClick && onSlotClick(p)}
                          style={{
                            borderRadius: 8,
                            transform: isCurrentKept ? 'translateY(-3px)' : 'none',
                            transition: 'transform 200ms cubic-bezier(.3,.7,.4,1)',
                            boxShadow: isCurrentKept ? '0 6px 14px rgba(0,0,0,0.45)' : 'none',
                            opacity: isCurrent ? 1 : 0.78,
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
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
