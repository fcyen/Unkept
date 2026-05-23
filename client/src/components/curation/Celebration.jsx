import { useMemo } from 'react';
import { downloadCuratedPhotos } from '../../lib/curatedDownload.js';

function Confetti() {
  const pieces = useMemo(
    () => Array.from({ length: 28 }, () => ({
      left: Math.random() * 100,
      delay: Math.random() * 1.2,
      rotate: Math.random() * 90 - 45,
      color: ['#FF6A2C', '#FFA15E', '#E5A55B', '#F4EFE6'][Math.floor(Math.random() * 4)],
    })),
    [],
  );
  return (
    <div className="curation-confetti">
      {pieces.map((p, i) => (
        <i
          key={i}
          style={{
            left: `${p.left}%`,
            background: p.color,
            animationDelay: `${p.delay}s`,
            transform: `rotate(${p.rotate}deg)`,
          }}
        />
      ))}
    </div>
  );
}

export default function Celebration({
  kept,
  target,
  chapterCount,
  tripName,
  keptPhotos = [],
  onContinue,
  onKeepRefining,
}) {
  const downloadable = keptPhotos.filter(
    (p) => p.thumbnailHeroUrl || p.thumbnailUrl,
  );
  return (
    <div className="curation-celebrate">
      <Confetti />
      <div className="eyebrow">Curation complete</div>
      <h1 className="serif">
        Your {tripName || 'trip'}<br />
        in <em>{kept} photos</em>.
      </h1>
      <div className="stat-row">
        <div className="stat">
          <div className="n serif">{chapterCount}</div>
          <div className="l">Chapters</div>
        </div>
        <div className="stat">
          <div className="n serif">{kept}</div>
          <div className="l">Kept</div>
        </div>
        <div className="stat">
          <div className="n serif">{target}</div>
          <div className="l">Goal</div>
        </div>
      </div>
      <button className="cta" onClick={onContinue} type="button">
        Play your story
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M3 1l9 6-9 6V1z" fill="#1A1714" />
        </svg>
      </button>
      {downloadable.length > 0 && (
        <button
          className="download"
          onClick={() => downloadCuratedPhotos(downloadable, tripName)}
          type="button"
        >
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <path
              d="M7 1v8M3.5 6L7 9.5 10.5 6M2 12.5h10"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Download {downloadable.length} photo{downloadable.length === 1 ? '' : 's'}
        </button>
      )}
      <button className="ghost" onClick={onKeepRefining} type="button">
        Keep refining
      </button>
    </div>
  );
}
