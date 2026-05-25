import { useEffect, useRef } from 'react';
import PhotoTile from './PhotoTile.jsx';

// BottomStrip — kept photos for every chapter, with chapters separated by a
// vertical divider. The current chapter is the only one that surfaces empty
// slots (up to its target) and the drag-landing affordance.
const SLOT = 48;
const SLOT_GAP = 7;
const DIVIDER_GAP = 12;

export default function BottomStrip({
  chapterStrips,
  totalKept,
  totalTarget,
  dropActive,
  currentKept,
  currentChapterId,
  onSlotClick,
}) {
  const currentRef = useRef(null);

  // Keep the current chapter visible as the user moves between days.
  useEffect(() => {
    const node = currentRef.current;
    if (!node) return;
    node.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
  }, [currentChapterId]);

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
          {totalKept}<span style={{ color: 'var(--paper-dim)' }}>/{totalTarget}</span>
        </div>
        <div style={{
          fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase',
          color: 'var(--paper-dim)', marginTop: 3,
        }}>kept</div>
      </div>

      <div
        style={{
          flex: 1, minWidth: 0,
          display: 'flex', alignItems: 'center', gap: DIVIDER_GAP,
          overflowX: 'auto', overflowY: 'hidden',
          scrollbarWidth: 'none',
          paddingBottom: 2, paddingTop: 2,
        }}
      >
        {chapterStrips.map((ch, idx) => (
          <ChapterGroup
            key={ch.id}
            innerRef={ch.isCurrent ? currentRef : null}
            chapter={ch}
            showDivider={idx > 0}
            dropActive={ch.isCurrent && dropActive}
            currentKept={currentKept}
            onSlotClick={onSlotClick}
          />
        ))}
      </div>
    </div>
  );
}

function ChapterGroup({ chapter, showDivider, dropActive, currentKept, onSlotClick, innerRef = null }) {
  const { kept, target, isCurrent } = chapter;
  // Other chapters render only the photos they kept. The current chapter also
  // surfaces empty slots up to its target so the user sees where the next
  // photo will land.
  const filled = kept.length;
  const slots = isCurrent ? Math.max(target, filled) : filled;
  const items = Array.from({ length: slots }, (_, i) => kept[i] || null);
  const landingIdx = items.findIndex((x) => x === null);

  return (
    <>
      {showDivider && (
        <div
          aria-hidden="true"
          style={{
            width: 1, alignSelf: 'stretch',
            background: 'var(--line)',
            margin: `0 -${(DIVIDER_GAP - SLOT_GAP) / 2}px`,
            flexShrink: 0,
          }}
        />
      )}
      <div
        ref={innerRef}
        style={{ display: 'flex', gap: SLOT_GAP, flexShrink: 0 }}
      >
        {items.length === 0 ? (
          <EmptyChapterMark />
        ) : items.map((p, i) => {
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
                    opacity: isCurrent ? 1 : 0.72,
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
    </>
  );
}

function EmptyChapterMark() {
  // A chapter with zero kept photos gets a small dim placeholder so the
  // divider doesn't sit flush against the next chapter's tiles.
  return (
    <div
      style={{
        width: SLOT, height: SLOT, borderRadius: 8,
        border: '1px dashed var(--line)',
        opacity: 0.5,
        flexShrink: 0,
      }}
    />
  );
}
