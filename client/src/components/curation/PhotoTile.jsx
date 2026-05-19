// PhotoTile — square thumbnail with timestamp and optional kept indicator.
export default function PhotoTile({ photo, kept, showMark, size, onClick, style }) {
  const s = {
    width: size,
    height: size,
    cursor: onClick ? 'pointer' : 'default',
    ...style,
  };
  const bg = photo.thumbnailUrl
    ? { backgroundImage: `url(${photo.thumbnailUrl})` }
    : { background: photo.grad || 'linear-gradient(150deg,#3d2a20,#6a4530,#b07a4f)' };
  return (
    <div className={'curation-tile' + (kept ? ' kept' : '')} style={s} onClick={onClick}>
      <div className="ph" style={bg} />
      {photo.ts && <div className="ts">{photo.ts}</div>}
      {kept && showMark && <div className="kept-mark">✓</div>}
    </div>
  );
}
