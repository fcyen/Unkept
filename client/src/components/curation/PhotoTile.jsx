// PhotoTile — square thumbnail with timestamp and optional kept indicator.
// When the upstream pipeline failed to decode a thumbnail (HEIC on Chrome,
// corrupt files, etc.) we render a visible "no preview" placeholder so the
// slot doesn't look like a rendering bug.
export default function PhotoTile({ photo, kept, showMark, size, onClick, style }) {
  const s = {
    width: size,
    height: size,
    cursor: onClick ? 'pointer' : 'default',
    ...style,
  };
  const hasThumb = !!photo.thumbnailUrl;
  const bg = hasThumb
    ? { backgroundImage: `url(${photo.thumbnailUrl})` }
    : { background: photo.grad || 'linear-gradient(150deg,#3d2a20,#6a4530,#b07a4f)' };
  return (
    <div className={'curation-tile' + (kept ? ' kept' : '')} style={s} onClick={onClick}>
      <div className="ph" style={bg}>
        {!hasThumb && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'rgba(244,239,230,0.55)',
            fontSize: Math.max(8, Math.round(size * 0.18)),
            fontFamily: 'Geist Mono, monospace',
            letterSpacing: '0.08em', textTransform: 'uppercase',
          }}>
            no preview
          </div>
        )}
      </div>
      {photo.ts && <div className="ts">{photo.ts}</div>}
      {kept && showMark && <div className="kept-mark">✓</div>}
    </div>
  );
}
