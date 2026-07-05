// ProgressBar — fills to a full green bar at the goal, then holds full while
// the colour drifts yellow → red as the kept set climbs toward 2× the goal.
export default function ProgressBar({ kept, target }) {
  // Bar is full once the goal is reached and stays full past it.
  const fill = target > 0 ? Math.min(1, kept / target) : 0;
  // 0 at goal, 1 at twice the goal — drives the over-goal green→red drift.
  const overRatio = target > 0
    ? Math.min(1, Math.max(0, (kept - target) / target))
    : 0;

  let barColor;
  if (kept === 0) {
    barColor = 'var(--paper-dim)';
  } else if (kept < target) {
    // Building toward the goal: cool blue easing into green.
    const t = kept / target;
    barColor = `hsl(${200 - t * 80} 55% 56%)`;
  } else {
    // At/over the goal: green (120°) → yellow (60°) → red (0°) by 2× goal.
    barColor = `hsl(${120 - overRatio * 120} 68% 52%)`;
  }

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
          width: `${fill * 100}%`,
          background: barColor,
          borderRadius: 999,
          transition: 'width 320ms cubic-bezier(.3,.7,.4,1), background 320ms ease',
          boxShadow: `0 0 12px ${barColor}`,
          opacity: 0.9,
        }} />
      </div>

      <div className="mono" style={{
        fontSize: 12, letterSpacing: '0.02em',
        color: 'var(--paper)', whiteSpace: 'nowrap',
      }}>
        {kept}<span style={{ color: 'var(--paper-dim)' }}> / {target}</span>
      </div>
    </div>
  );
}
