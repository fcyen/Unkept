// ChapterRail — horizontal chapter pills with kept counts.
export default function ChapterRail({ chapters, current, keptByChapter, onPick }) {
  return (
    <div className="curation-chapters">
      {chapters.map((ch) => {
        const kept = keptByChapter[ch.id] || 0;
        const hasAny = kept > 0;
        const isCurrent = ch.id === current;
        return (
          <button
            key={ch.id}
            className="curation-chapter-pill"
            data-on={isCurrent ? '1' : '0'}
            onClick={() => onPick(ch.id)}
            type="button"
          >
            <span
              className="dot"
              style={{ background: hasAny ? 'var(--accent)' : 'var(--paper-dim)' }}
            />
            <span>{ch.name}</span>
            <span className="frac">{kept}</span>
          </button>
        );
      })}
    </div>
  );
}
