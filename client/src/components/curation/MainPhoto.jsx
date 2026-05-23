import { useRef, useState } from 'react';

// MainPhoto — large judgement view with drag-to-keep / drag-up-to-unkeep gesture.
const KEEP_THRESHOLD = 80;
const UNKEEP_THRESHOLD = -60;

export default function MainPhoto({
  photo,
  kept,
  isStarter,
  onKeep,
  onUnkeep,
  onDragChange,
  showStarterHint,
}) {
  const [dy, setDy] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startRef = useRef({ y: 0, moved: false });

  const onPointerDown = (e) => {
    startRef.current = { y: e.clientY, moved: false };
    setDragging(true);
    if (e.target.setPointerCapture) e.target.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!dragging) return;
    const d = e.clientY - startRef.current.y;
    if (Math.abs(d) > 4) startRef.current.moved = true;
    setDy(d);
    if (onDragChange) onDragChange(d > 20 ? 'keep' : d < -20 && kept ? 'unkeep' : null, d);
  };
  const onPointerUp = () => {
    if (!dragging) return;
    setDragging(false);
    const d = dy;
    setDy(0);
    if (onDragChange) onDragChange(null, 0);
    if (!startRef.current.moved) return;
    if (d >= KEEP_THRESHOLD && !kept) onKeep && onKeep();
    else if (d <= UNKEEP_THRESHOLD && kept) onUnkeep && onUnkeep();
  };

  const progress = Math.max(-1, Math.min(1, dy / KEEP_THRESHOLD));
  const tilt = progress * 3;
  const scale = 1 - Math.abs(progress) * 0.04;

  const heroUrl = photo.thumbnailHeroUrl || photo.thumbnailUrl;
  const hasThumb = !!heroUrl;
  const bg = hasThumb
    ? {
      backgroundImage: `url(${heroUrl})`,
      backgroundSize: 'contain',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
      backgroundColor: '#0F0D0B',
    }
    : { background: photo.grad || 'linear-gradient(150deg,#3d2a20,#6a4530,#b07a4f)' };

  return (
    <div style={{
      position: 'relative', flex: 1, minHeight: 0,
      borderRadius: 14, overflow: 'visible',
      touchAction: 'none',
    }}>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          position: 'relative', width: '100%', height: '100%',
          borderRadius: 14, overflow: 'hidden',
          ...bg,
          transform: `translateY(${dy * 0.6}px) rotate(${tilt}deg) scale(${scale})`,
          transition: dragging ? 'none' : 'transform 220ms cubic-bezier(.3,.7,.4,1)',
          boxShadow: kept
            ? 'inset 0 0 0 2.5px var(--accent), 0 10px 30px rgba(0,0,0,0.45)'
            : '0 10px 30px rgba(0,0,0,0.35)',
          cursor: 'grab',
          userSelect: 'none',
        }}
      >
        <div style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(120% 80% at 30% 30%, rgba(255,255,255,0.10), transparent 55%), radial-gradient(120% 80% at 80% 90%, rgba(0,0,0,0.30), transparent 60%)',
          pointerEvents: 'none',
        }} />

        {!hasThumb && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            color: 'rgba(244,239,230,0.7)',
            pointerEvents: 'none', gap: 10, padding: 20, textAlign: 'center',
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
              <path d="M3 16l5-5 4 4 3-3 6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="15" cy="9" r="1.5" fill="currentColor" />
              <path d="M4 4l16 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <div style={{
              fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase',
              fontFamily: 'Geist Mono, monospace',
            }}>Preview unavailable</div>
            {photo.name && (
              <div style={{
                fontSize: 10, color: 'var(--paper-dim)',
                fontFamily: 'Geist Mono, monospace',
                wordBreak: 'break-all', maxWidth: '80%',
              }}>{photo.name}</div>
            )}
          </div>
        )}

        {photo.ts && (
          <div className="mono" style={{
            position: 'absolute', left: 12, bottom: 10,
            fontSize: 12, letterSpacing: '0.06em',
            color: 'rgba(255,255,255,0.92)',
            textShadow: '0 1px 3px rgba(0,0,0,0.5)',
            pointerEvents: 'none',
          }}>{photo.ts}</div>
        )}

        {isStarter && !kept && (
          <div style={{
            position: 'absolute', left: 10, top: 10,
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '5px 9px',
            background: 'rgba(26,23,20,0.55)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            border: '0.5px solid rgba(244,239,230,0.18)',
            borderRadius: 999, color: 'rgba(244,239,230,0.92)',
            fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase',
            fontWeight: 500,
            pointerEvents: 'none',
          }}>
            <svg width="9" height="9" viewBox="0 0 10 10" fill="currentColor">
              <circle cx="5" cy="5" r="2" />
            </svg>
            We picked this
          </div>
        )}

        {/* Top-right toggle — always present. Tap to keep / remove. */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (kept) onUnkeep && onUnkeep();
            else onKeep && onKeep();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label={kept ? 'Remove from kept' : 'Keep this photo'}
          title={kept ? 'Tap to remove' : 'Tap to keep'}
          style={{
            position: 'absolute', right: 12, top: 12,
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '6px 11px 6px 9px',
            background: kept ? 'var(--accent)' : 'rgba(26,23,20,0.55)',
            backdropFilter: kept ? 'none' : 'blur(8px)',
            WebkitBackdropFilter: kept ? 'none' : 'blur(8px)',
            color: kept ? '#1A1714' : 'var(--paper)',
            borderRadius: 999, fontSize: 10, fontWeight: 700,
            letterSpacing: '0.08em', textTransform: 'uppercase',
            boxShadow: kept ? '0 4px 10px rgba(255,106,44,0.35)' : 'none',
            border: kept ? 0 : '0.5px solid rgba(244,239,230,0.30)',
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          {kept ? (
            <>
              <svg width="11" height="9" viewBox="0 0 12 10" fill="none">
                <path d="M1 5l3.5 3.5L11 1.5" stroke="#1A1714" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Kept
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                marginLeft: 2, width: 14, height: 14, borderRadius: '50%',
                background: 'rgba(26,23,20,0.20)',
              }}>
                <svg width="7" height="7" viewBox="0 0 8 8" fill="none">
                  <path d="M2 2l4 4M6 2l-4 4" stroke="#1A1714" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </span>
            </>
          ) : (
            <>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              Keep
            </>
          )}
        </button>

        {progress > 0 && !kept && (
          <div style={{
            position: 'absolute', left: 0, right: 0, bottom: 12,
            display: 'flex', justifyContent: 'center',
            pointerEvents: 'none', opacity: progress,
          }}>
            <div style={{
              fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase',
              color: 'var(--accent)', fontWeight: 600,
              background: 'rgba(26,23,20,0.7)', padding: '6px 12px',
              borderRadius: 999, border: '0.5px solid var(--accent)',
            }}>
              {progress >= 1 ? 'Release to keep' : 'Drag to keep ↓'}
            </div>
          </div>
        )}

        {progress < 0 && kept && (
          <div style={{
            position: 'absolute', left: 0, right: 0, top: 12,
            display: 'flex', justifyContent: 'center',
            pointerEvents: 'none', opacity: -progress,
          }}>
            <div style={{
              fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase',
              color: 'var(--paper)', fontWeight: 600,
              background: 'rgba(26,23,20,0.7)', padding: '6px 12px',
              borderRadius: 999, border: '0.5px solid var(--paper-dim)',
            }}>
              {progress <= -1 ? 'Release to remove' : 'Drag up to remove ↑'}
            </div>
          </div>
        )}
      </div>

      {showStarterHint && (
        <div className="serif" style={{
          position: 'absolute', left: 0, right: 0, top: -22,
          textAlign: 'center', pointerEvents: 'none',
          fontSize: 11, color: 'var(--paper-dim)', fontStyle: 'italic',
        }}>
          We picked a few to start — swap any.
        </div>
      )}
    </div>
  );
}
