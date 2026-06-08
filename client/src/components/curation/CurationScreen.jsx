import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './curation.css';
import { track } from '../../lib/analytics.js';
import ChapterRail from './ChapterRail.jsx';
import MainPhoto from './MainPhoto.jsx';
import RightStrip from './RightStrip.jsx';
import BottomStrip from './BottomStrip.jsx';
import ProgressBar from './ProgressBar.jsx';
import Celebration from './Celebration.jsx';

// Build the view-model the curation UI consumes from a Story / Story Skeleton.
function buildViewModel(story) {
  const skeleton = story.skeleton || story; // accept either
  const photosMap = skeleton.photos || {};

  const burstByPhoto = {};
  (skeleton.burstGroups || []).forEach((g, idx) => {
    const bid = `b${idx}`;
    burstByPhoto[g.representativeId] = bid;
    (g.candidateIds || []).forEach((id) => { burstByPhoto[id] = bid; });
  });

  // Surface a chapter target — proportional split of meta.surveyResponses.targetCount
  // when present, otherwise ~20% of the chapter's photos (min 1, max 8).
  const surveyTarget = skeleton.meta?.surveyResponses?.targetCount;
  const totalPhotos = Object.keys(photosMap).length || 1;

  const chapters = (skeleton.chapters || []).map((ch, i) => {
    const chapterPhotoIds = ch.photoIds || [];
    const proportional = surveyTarget
      ? Math.max(1, Math.round((chapterPhotoIds.length / totalPhotos) * surveyTarget))
      : Math.min(8, Math.max(1, Math.round(chapterPhotoIds.length * 0.2)));
    const fromStory = story.chapters?.[i];
    // sub = "Day N" tag; name = location label only when geocoding resolved.
    // When there's no location we render the day alone (no "Day 1 · Day 1").
    const sub = `Day ${fromStory?.dayIndex || i + 1}`;
    const name = fromStory?.location?.label || '';
    const starter = ch.heroPhotoId ? [ch.heroPhotoId] : chapterPhotoIds.slice(0, 1);
    return {
      id: ch.id,
      name,
      sub,
      target: proportional,
      starter,
      photoIds: chapterPhotoIds,
    };
  });

  // Per-photo view model: ts (HH:MM), timestampMs (for gap math), and burst id.
  const photoById = {};
  Object.values(photosMap).forEach((p) => {
    const tsDate = p.timestamp ? new Date(p.timestamp) : null;
    const hh = tsDate && !isNaN(tsDate) ? String(tsDate.getHours()).padStart(2, '0') : '';
    const mm = tsDate && !isNaN(tsDate) ? String(tsDate.getMinutes()).padStart(2, '0') : '';
    photoById[p.id] = {
      ...p,
      ts: hh && mm ? `${hh}:${mm}` : '',
      timestampMs: tsDate ? tsDate.getTime() : 0,
      burst: burstByPhoto[p.id] || null,
    };
  });

  // Photos by chapter, ordered as the skeleton orders them.
  const photosByChapter = {};
  chapters.forEach((ch) => {
    photosByChapter[ch.id] = ch.photoIds
      .map((id) => photoById[id])
      .filter(Boolean);
  });

  const tripName = skeleton.meta?.surveyResponses?.tripName
    || story.tripName
    || story.chapters?.[0]?.location?.country
    || 'trip';

  const dateLabel = (() => {
    const range = skeleton.meta?.dateRange;
    if (!range?.start) return '';
    const d = new Date(range.start);
    if (isNaN(d)) return '';
    return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  })();

  return { chapters, photoById, photosByChapter, tripName, dateLabel };
}

// Chapter palette used to tint kept-photo glows in the BottomStrip. Hues are
// spaced around the wheel and tuned to read on the dark Darkroom canvas
// without competing with the orange "accent" used for active UI affordances.
const CHAPTER_GLOW_COLORS = [
  '#FF6A2C', // orange
  '#6FA8C7', // cool blue
  '#B8D060', // good green
  '#E5A55B', // warm yellow
  '#C77FA8', // muted pink
  '#7FC7A8', // mint
  '#A87FC7', // muted purple
];

function ambientClass(kept, target) {
  if (kept === 0) return 'empty';
  if (kept < target) return 'under';
  if (kept <= Math.ceil(target * 1.15)) return 'on';
  return 'over';
}

export default function CurationScreen({ story, originals, onComplete, onBack }) {
  const vm = useMemo(() => buildViewModel(story), [story]);
  const { chapters, photoById, photosByChapter, tripName, dateLabel } = vm;

  const firstChapter = chapters[0];
  const [chapterId, setChapterId] = useState(firstChapter?.id);
  const [photoIdx, setPhotoIdx] = useState(0);
  const [dropHint, setDropHint] = useState(null);
  const [showStarter, setShowStarter] = useState(true);
  const [showCelebrate, setShowCelebrate] = useState(false);

  const [kept, setKept] = useState(() => {
    const s = new Set();
    chapters.forEach((c) => c.starter.forEach((id) => s.add(id)));
    return s;
  });
  const [touched, setTouched] = useState(() => new Set());
  const [streak, setStreak] = useState(0);

  // Telemetry refs (no re-render): screen mount time for curation_duration,
  // raw keep/remove press count for toggle_count (distinct from touched.size —
  // effort vs. decision breadth), and a guard so a normal finish isn't also
  // logged as a tab-close bail-out.
  const mountedAtRef = useRef(null);
  const togglePressesRef = useRef(0);
  const completedRef = useRef(false);

  // Auto-kept = the starter (hero) set the screen opens with; the funnel
  // compares it against the user's final keep set.
  const autoKeptCount = useMemo(
    () => new Set(chapters.flatMap((c) => c.starter)).size,
    [chapters],
  );
  const uploadedCount = (story.skeleton || story).meta?.totalPhotosInput
    ?? Object.keys(photoById).length;

  const toggle = useCallback((id, on) => {
    togglePressesRef.current += 1;
    setKept((prev) => {
      const next = new Set(prev);
      const wantsOn = on === undefined ? !prev.has(id) : on;
      if (wantsOn) next.add(id); else next.delete(id);
      return next;
    });
    setTouched((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    setStreak((s) => (on === false ? 0 : s + 1));
  }, []);

  const chapter = chapters.find((c) => c.id === chapterId) || firstChapter;
  const chapterPhotos = photosByChapter[chapter?.id] || [];
  const current = chapterPhotos[photoIdx];

  // Per-chapter kept photos, in skeleton order, for the bottom strip across
  // all days and for the count badges on the chapter rail.
  const keptByChapterPhotos = useMemo(() => {
    const m = {};
    chapters.forEach((c) => {
      m[c.id] = (photosByChapter[c.id] || []).filter((p) => kept.has(p.id));
    });
    return m;
  }, [kept, chapters, photosByChapter]);

  const keptByChapter = useMemo(() => {
    const m = {};
    chapters.forEach((c) => { m[c.id] = (keptByChapterPhotos[c.id] || []).length; });
    return m;
  }, [chapters, keptByChapterPhotos]);

  const chapterStrips = useMemo(
    () => chapters.map((c, i) => ({
      id: c.id,
      target: c.target,
      kept: keptByChapterPhotos[c.id] || [],
      isCurrent: c.id === chapter?.id,
      color: CHAPTER_GLOW_COLORS[i % CHAPTER_GLOW_COLORS.length],
    })),
    [chapters, keptByChapterPhotos, chapter?.id],
  );

  const totalKept = kept.size;
  const totalTarget = chapters.reduce((s, c) => s + c.target, 0);

  // Kept photos in chronological order — handed to the completion screen so
  // the user can download the curated set.
  const keptPhotos = useMemo(
    () => [...kept]
      .map((id) => photoById[id])
      .filter(Boolean)
      .sort((a, b) => (a.timestampMs || 0) - (b.timestampMs || 0)),
    [kept, photoById],
  );

  useEffect(() => {
    if (!showStarter) return;
    const t = setTimeout(() => setShowStarter(false), 4500);
    return () => clearTimeout(t);
  }, [showStarter]);
  useEffect(() => {
    if (touched.size > 0) setShowStarter(false);
  }, [touched.size]);

  // Mark the curation start, and treat leaving the tab before Finish as a
  // bail-out — one of the few "this isn't working" signals we get without a
  // survey. A normal Finish sets completedRef so it isn't double-counted.
  useEffect(() => {
    mountedAtRef.current = performance.now();
    const onPageHide = () => {
      if (!completedRef.current) track('bail_out', { from: 'tab_close' });
    };
    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
  }, []);

  if (!chapter || !current) {
    return (
      <div className="curation-root">
        <div style={{ margin: 'auto', color: 'var(--paper-mute)' }}>
          No photos to curate.
        </div>
      </div>
    );
  }

  const goNext = () => setPhotoIdx((i) => Math.min(chapterPhotos.length - 1, i + 1));
  const goPrev = () => setPhotoIdx((i) => Math.max(0, i - 1));
  const pickIdx = (i) => setPhotoIdx(i);

  const onKeep = () => { toggle(current.id, true); setTimeout(goNext, 240); };
  const onUnkeep = () => { toggle(current.id, false); };

  const onSlotClick = (p) => {
    if (current.id === p.id) {
      toggle(p.id, false);
      return;
    }
    const inCurrent = chapterPhotos.findIndex((x) => x.id === p.id);
    if (inCurrent >= 0) { pickIdx(inCurrent); return; }
    // Slot belongs to another chapter — jump to that chapter and the photo.
    const owner = chapters.find((c) => c.photoIds.includes(p.id));
    if (!owner) return;
    const photos = photosByChapter[owner.id] || [];
    const idx = photos.findIndex((x) => x.id === p.id);
    setChapterId(owner.id);
    setPhotoIdx(Math.max(0, idx));
  };

  // Finish = curation complete (the Celebration screen is the reward, and in
  // the production flow the user may download from there without pressing
  // Continue) — so the completion metrics fire here, not on Continue.
  const onFinish = () => {
    // Emit completion metrics once — the user can return via "Keep refining"
    // and Finish again, but that shouldn't double-count.
    if (!completedRef.current) {
      completedRef.current = true;
      if (mountedAtRef.current != null) {
        track('curation_duration', {
          ms: Math.round(performance.now() - mountedAtRef.current),
        });
      }
      track('toggle_count', {
        presses: togglePressesRef.current,  // raw effort
        distinctPhotos: touched.size,       // distinct photos acted on
      });
      track('curation_funnel', {
        uploaded: uploadedCount,
        autoKept: autoKeptCount,
        userKept: kept.size,
      });
    }
    setShowCelebrate(true);
  };

  const handleBack = () => {
    track('bail_out', { from: 'back' });
    onBack();
  };

  return (
    <div className="curation-root">
      <div className={`curation-ambient ${ambientClass(totalKept, totalTarget)}`} />

      <div className="curation-topbar">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="trip">
            {tripName}{dateLabel ? ` · ${dateLabel}` : ''}
          </div>
          <div className="chapter-title serif">
            {chapter.name
              ? <>{chapter.sub} <em>·</em> {chapter.name}</>
              : chapter.sub}
          </div>
          <ProgressBar kept={totalKept} target={totalTarget} streak={streak} />
        </div>
        {onBack && (
          <button className="back-btn" onClick={handleBack} type="button">Back</button>
        )}
      </div>

      <ChapterRail
        chapters={chapters}
        current={chapter.id}
        keptByChapter={keptByChapter}
        onPick={(id) => { setChapterId(id); setPhotoIdx(0); }}
      />

      <div className="curation-stage">
        <div className="main-col">
          <MainPhoto
            photo={current}
            kept={kept.has(current.id)}
            isStarter={chapter.starter.includes(current.id) && !touched.has(current.id)}
            onKeep={onKeep}
            onUnkeep={onUnkeep}
            onDragChange={(d) => setDropHint(d)}
            showStarterHint={showStarter && photoIdx === 0}
          />
        </div>
        <div className="right-col">
          <RightStrip
            chapterPhotos={chapterPhotos}
            currentIdx={photoIdx}
            keptSet={kept}
            onPick={pickIdx}
          />
        </div>
      </div>

      <div className="curation-bottombar">
        <BottomStrip
          chapterStrips={chapterStrips}
          totalKept={totalKept}
          totalTarget={totalTarget}
          dropActive={dropHint === 'keep'}
          currentKept={kept.has(current.id) ? current.id : null}
          currentChapterId={chapter.id}
          onSlotClick={onSlotClick}
        />
        <NavRow
          onPrev={goPrev}
          onNext={goNext}
          kept={kept.has(current.id)}
          onUnkeep={onUnkeep}
          onFinish={onFinish}
          photoIdx={photoIdx}
          total={chapterPhotos.length}
          canFinish={totalKept > 0}
        />
      </div>

      {showCelebrate && (
        <Celebration
          kept={totalKept}
          target={totalTarget}
          chapterCount={chapters.length}
          tripName={tripName}
          keptPhotos={keptPhotos}
          originals={originals}
          onContinue={() => {
            setShowCelebrate(false);
            onComplete && onComplete({ keptIds: [...kept] });
          }}
          onKeepRefining={() => setShowCelebrate(false)}
        />
      )}
    </div>
  );
}

function NavRow({ onPrev, onNext, kept, onUnkeep, onFinish, photoIdx, total, canFinish }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 4 }}>
      <button
        onClick={onPrev}
        className="curation-iconbtn"
        aria-label="Previous"
        disabled={photoIdx === 0}
        type="button"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {kept ? (
          <button
            onClick={onUnkeep}
            aria-label="Remove from kept"
            type="button"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 14px 8px 12px', borderRadius: 999,
              border: '0.5px solid rgba(255,106,44,0.5)',
              background: 'rgba(255,106,44,0.10)',
              color: 'var(--accent-2)', fontFamily: 'inherit',
              fontSize: 11, fontWeight: 600, letterSpacing: '0.08em',
              textTransform: 'uppercase', cursor: 'pointer',
            }}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            Remove
          </button>
        ) : (
          <div className="mono" style={{
            fontSize: 11, color: 'var(--paper-dim)', letterSpacing: '0.08em',
          }}>{photoIdx + 1} / {total}</div>
        )}
      </div>
      <button
        onClick={onNext}
        className="curation-iconbtn"
        aria-label="Next"
        disabled={photoIdx >= total - 1}
        type="button"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M5 2l5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <button
        onClick={onFinish}
        className="curation-finish"
        disabled={!canFinish}
        type="button"
      >
        Finish
        <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
          <path d="M3 1l9 6-9 6V1z" fill="#1A1714" />
        </svg>
      </button>
    </div>
  );
}
