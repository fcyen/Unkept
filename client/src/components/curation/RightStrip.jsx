import { useLayoutEffect, useRef, useState, Fragment } from 'react';
import PhotoTile from './PhotoTile.jsx';

// RightStrip — vertical column of timestamp neighbours with chevron rail,
// time-gap labels, and burst-group brackets.
const STRIP_WIDTH = 64;
const TILE = 48;
const GAP = 6;

function minutesBetween(a, b) {
  if (!a.timestampMs || !b.timestampMs) return 0;
  return Math.abs(b.timestampMs - a.timestampMs) / 60000;
}

export default function RightStrip({ chapterPhotos, currentIdx, keptSet, onPick }) {
  const scrollRef = useRef(null);
  const railRef = useRef(null);
  const [railTop, setRailTop] = useState(0);

  useLayoutEffect(() => {
    const el = railRef.current?.querySelector(`[data-i="${currentIdx}"]`);
    const container = scrollRef.current;
    if (!el || !container) return;
    const elTop = el.offsetTop;
    setRailTop(elTop + TILE / 2 - 6);
    const target = elTop - container.clientHeight / 2 + TILE / 2;
    container.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
  }, [currentIdx]);

  return (
    <div style={{ width: STRIP_WIDTH, height: '100%', position: 'relative', display: 'flex' }}>
      <div style={{ width: 10, position: 'relative', flexShrink: 0 }}>
        <div style={{
          position: 'absolute', top: railTop, left: 0,
          width: 10, height: 12,
          transition: 'top 220ms cubic-bezier(.3,.7,.4,1)',
        }}>
          <svg viewBox="0 0 10 12" width="10" height="12">
            <path d="M9 6 L1 1 L1 11 Z" fill="var(--accent)" />
          </svg>
        </div>
      </div>

      <div
        ref={scrollRef}
        style={{
          flex: 1, overflowY: 'auto', overflowX: 'hidden',
          scrollbarWidth: 'none', position: 'relative',
          maskImage: 'linear-gradient(to bottom, transparent 0, #000 14px, #000 calc(100% - 14px), transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, transparent 0, #000 14px, #000 calc(100% - 14px), transparent 100%)',
        }}
      >
        <div
          ref={railRef}
          style={{
            display: 'flex', flexDirection: 'column', gap: GAP,
            paddingTop: 8, paddingBottom: 8, paddingLeft: 6,
          }}
        >
          {chapterPhotos.map((p, i) => {
            const prev = chapterPhotos[i - 1];
            const gap = prev ? minutesBetween(prev, p) : 0;
            const showGap = gap >= 20;
            const isCurrent = i === currentIdx;
            const burstStart = p.burst && (!prev || prev.burst !== p.burst);
            const burstEnd = p.burst && (i === chapterPhotos.length - 1 || chapterPhotos[i + 1]?.burst !== p.burst);
            const inBurst = !!p.burst;
            return (
              <Fragment key={p.id}>
                {showGap && (
                  <div className="mono" style={{
                    fontSize: 9, color: 'var(--paper-dim)',
                    textAlign: 'left', letterSpacing: '0.04em',
                    padding: '4px 0 4px 4px',
                  }}>
                    <span style={{
                      display: 'inline-block', width: 8, height: 1,
                      background: 'var(--line)', verticalAlign: 'middle', marginRight: 4,
                    }} />
                    +{gap > 90 ? `${Math.round(gap / 60 * 10) / 10}h` : `${Math.round(gap)}m`}
                  </div>
                )}
                <div data-i={i} style={{ position: 'relative' }}>
                  {inBurst && (
                    <div style={{
                      position: 'absolute', left: -4, top: burstStart ? 0 : -GAP / 2 - 1,
                      bottom: burstEnd ? 0 : -GAP / 2 - 1, width: 3,
                      borderLeft: '1.5px solid var(--paper-dim)',
                      borderTop: burstStart ? '1.5px solid var(--paper-dim)' : 'none',
                      borderBottom: burstEnd ? '1.5px solid var(--paper-dim)' : 'none',
                      borderTopLeftRadius: burstStart ? 4 : 0,
                      borderBottomLeftRadius: burstEnd ? 4 : 0,
                      pointerEvents: 'none',
                    }} />
                  )}
                  <PhotoTile
                    photo={p}
                    size={TILE}
                    kept={keptSet.has(p.id)}
                    showMark={keptSet.has(p.id)}
                    onClick={() => onPick(i)}
                    style={{
                      borderRadius: 8,
                      outline: isCurrent ? '1.5px solid var(--paper)' : 'none',
                      outlineOffset: isCurrent ? 1 : 0,
                      opacity: isCurrent ? 1 : 0.84,
                    }}
                  />
                </div>
              </Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}
