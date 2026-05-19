// ProgressBar — three-zone (under / on-target / over) horizontal progress.
export default function ProgressBar({ kept, target, streak }) {
  const max = Math.max(target * 1.5, target + 4);
  const pos = Math.min(1, kept / max);
  const targetRatio = target / max;
  const overRatio = (target * 1.15) / max;

  const zone = kept === 0
    ? 'empty'
    : kept < target
      ? 'under'
      : kept <= Math.ceil(target * 1.15)
        ? 'on'
        : 'over';
  const thumbColor = zone === 'over'
    ? 'var(--warm)'
    : zone === 'on'
      ? 'var(--good)'
      : zone === 'under'
        ? 'var(--cool)'
        : 'var(--paper-dim)';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 6 }}>
      <div style={{
        flex: 1, minWidth: 0, position: 'relative',
        height: 4, borderRadius: 999,
        background: 'rgba(244,239,230,0.08)',
        overflow: 'visible',
      }}>
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: `${targetRatio * 100}%`,
          background: 'rgba(111,168,199,0.16)',
          borderRadius: '999px 0 0 999px',
        }} />
        <div style={{
          position: 'absolute', left: `${targetRatio * 100}%`, top: 0, bottom: 0,
          width: `${(overRatio - targetRatio) * 100}%`,
          background: 'rgba(184,208,96,0.20)',
        }} />
        <div style={{
          position: 'absolute', left: `${overRatio * 100}%`, top: 0, bottom: 0, right: 0,
          background: 'rgba(229,165,91,0.16)',
          borderRadius: '0 999px 999px 0',
        }} />
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: `${pos * 100}%`,
          background: thumbColor,
          borderRadius: 999,
          transition: 'width 320ms cubic-bezier(.3,.7,.4,1), background 320ms ease',
          boxShadow: `0 0 12px ${thumbColor}`,
          opacity: 0.85,
        }} />
        <div style={{
          position: 'absolute', left: `calc(${targetRatio * 100}% - 0.5px)`,
          top: -3, bottom: -3, width: 1,
          background: 'var(--paper-mute)', opacity: 0.55,
        }} />
        <div style={{
          position: 'absolute', left: `calc(${targetRatio * 100}% - 8px)`,
          top: -14,
          fontSize: 8, color: 'var(--paper-dim)', letterSpacing: '0.08em',
          textTransform: 'uppercase', fontFamily: 'Geist Mono, monospace',
        }}>goal</div>
      </div>

      <div className="mono" style={{
        fontSize: 12, letterSpacing: '0.02em',
        color: 'var(--paper)', whiteSpace: 'nowrap',
      }}>
        {kept}<span style={{ color: 'var(--paper-dim)' }}> / {target}</span>
      </div>

      {streak >= 3 && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '3px 7px 3px 5px', borderRadius: 999,
          background: 'rgba(255,106,44,0.14)',
          border: '0.5px solid rgba(255,106,44,0.45)',
          color: 'var(--accent-2)',
          fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
          fontFamily: 'Geist Mono, monospace',
        }}>
          <svg width="8" height="10" viewBox="0 0 8 10" fill="currentColor">
            <path d="M4 0 C 5 2 7 3 7 6 A 3 3 0 0 1 1 6 C 1 4 2 4 2 2 C 3 3 3 2 4 0Z" />
          </svg>
          {streak}
        </div>
      )}
    </div>
  );
}
