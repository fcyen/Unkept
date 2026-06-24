import { useEffect, useRef, useState } from 'react';
import { PHASES } from '../lib/pipeline/orchestrator.js';
import { usePipelineDebug, STAGE_ORDER, STAGE_LABELS } from './usePipelineDebug.js';
import sampleImageUrls, { sampleImagesDir } from 'virtual:sample-images';

// The aesthetic proxy (same host the aestheticScore stage posts to).
const AESTHETIC_SERVER = 'http://localhost:3001';

const CLUSTER_PALETTE = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#f97316',
];

function scoreToColor(score) {
  if (score == null) return '#9ca3af';
  const c = Math.max(0, Math.min(1, score));
  if (c >= 0.7) return '#22c55e';
  if (c >= 0.4) return '#f59e0b';
  return '#ef4444';
}

async function loadSampleFiles() {
  return Promise.all(
    sampleImageUrls.map(async (url) => {
      const res = await fetch(url);
      const blob = await res.blob();
      const name = url.split('/').pop();
      const type = blob.type || (name.match(/\.heic$/i) ? 'image/heic' : 'image/jpeg');
      return new File([blob], name, { type });
    }),
  );
}

export default function PipelineDebugRoute() {
  const {
    phase, progress, snapshots, error, run, reset, getPreviewUrl, revokeAll,
    useSemanticClustering, setUseSemanticClustering,
  } = usePipelineDebug();
  const [selectedStage, setSelectedStage] = useState('qualityScore');
  const [sortByScore, setSortByScore] = useState(false);
  const [selectedPhotoId, setSelectedPhotoId] = useState(null);
  const [userDidReset, setUserDidReset] = useState(false);
  // Per-photo "which model scored this better" votes: { [photoId]: modelLabel }.
  // Lives only in the debug session — a quick way to A/B-judge the two models.
  const [modelVotes, setModelVotes] = useState({});
  const autoStarted = useRef(false);

  useEffect(() => () => revokeAll(), [revokeAll]);

  // Auto-load sample images on first mount. Skipped if the user clicked
  // "New run" (userDidReset), since they want to choose photos manually.
  useEffect(() => {
    if (autoStarted.current || userDidReset || sampleImageUrls.length === 0) return;
    autoStarted.current = true;
    loadSampleFiles().then(run);
  }, [run, userDidReset]);

  const handleNewRun = () => {
    reset();
    setUserDidReset(true);
    setSelectedPhotoId(null);
    setModelVotes({});
  };

  // Toggle a vote: clicking the already-voted model clears it.
  const handleVote = (photoId, model) => {
    setModelVotes((prev) => {
      const next = { ...prev };
      if (next[photoId] === model) delete next[photoId];
      else next[photoId] = model;
      return next;
    });
  };

  // Clear selection when stage changes
  const handleStageSelect = (stage) => {
    setSelectedStage(stage);
    setSelectedPhotoId(null);
  };

  return (
    <div className="min-h-screen bg-cream text-ink">
      <header className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">
        <div>
          <h1 className="font-serif text-3xl">/pipeline</h1>
          <p className="text-muted text-sm mt-1">
            Phase 1 inspector — per-photo scoring at every stage.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <span className="text-sm text-muted">Semantic clustering</span>
            <button
              role="switch"
              aria-checked={useSemanticClustering}
              onClick={() => setUseSemanticClustering((v) => !v)}
              className={`relative w-9 h-5 rounded-full transition-colors ${useSemanticClustering ? 'bg-ink' : 'bg-faint'}`}
            >
              <span
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${useSemanticClustering ? 'translate-x-4' : 'translate-x-0.5'}`}
              />
            </button>
          </label>
          {phase !== PHASES.IDLE && (
            <button
              className="text-sm text-muted underline underline-offset-2"
              onClick={handleNewRun}
            >
              New run
            </button>
          )}
        </div>
      </header>

      {phase === PHASES.IDLE && <DropZone onDrop={run} hasSamples={sampleImageUrls.length > 0} />}

      {phase === PHASES.RUNNING && !snapshots.exif && (
        <div className="max-w-7xl mx-auto px-6 py-12 text-center text-muted">
          {sampleImageUrls.length > 0
            ? `Loading ${sampleImageUrls.length} sample image${sampleImageUrls.length !== 1 ? 's' : ''}…`
            : 'Reading EXIF data…'}
        </div>
      )}

      {error && (
        <div className="max-w-7xl mx-auto px-6 mb-6">
          <div className="rounded bg-red-50 border border-red-200 p-4 text-red-800 text-sm font-mono">
            {error.message}
          </div>
        </div>
      )}

      {snapshots.exif && (
        <main className="max-w-7xl mx-auto px-6 pb-12 space-y-5">
          <StageTimeline
            snapshots={snapshots}
            running={phase === PHASES.RUNNING}
            progress={progress}
            selected={selectedStage}
            onSelect={handleStageSelect}
          />
          <StageStats stage={selectedStage} snapshots={snapshots} />
          {selectedStage === 'aestheticScore' && snapshots.aestheticScore && (
            <>
              <CacheControl />
              <VoteTally snapshots={snapshots} votes={modelVotes} />
              <ModelComparison
                snapshots={snapshots}
                photoId={selectedPhotoId}
                vote={modelVotes[selectedPhotoId] ?? null}
                onVote={handleVote}
              />
            </>
          )}
          {selectedPhotoId && selectedStage !== 'aestheticScore' && (
            <PhotoDetail
              photoId={selectedPhotoId}
              stage={selectedStage}
              snapshots={snapshots}
              getPreviewUrl={getPreviewUrl}
              onClose={() => setSelectedPhotoId(null)}
            />
          )}
          <PhotoGrid
            snapshots={snapshots}
            stage={selectedStage}
            getPreviewUrl={getPreviewUrl}
            sortByScore={sortByScore}
            onToggleSort={() => setSortByScore((s) => !s)}
            selectedPhotoId={selectedPhotoId}
            onSelectPhoto={setSelectedPhotoId}
          />
        </main>
      )}
    </div>
  );
}

// ── DropZone ────────────────────────────────────────────────────────────────

function DropZone({ onDrop, hasSamples }) {
  const [dragging, setDragging] = useState(false);

  const handleFiles = (files) => {
    const images = [...files].filter(
      (f) => f.type.startsWith('image/') || /\.heic$/i.test(f.name),
    );
    if (images.length > 0) onDrop(images);
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-12 space-y-4">
      {hasSamples && (
        <div className="flex items-center justify-between rounded-lg border border-faint bg-white px-4 py-3">
          <p className="text-sm text-muted">
            {sampleImageUrls.length} sample image{sampleImageUrls.length !== 1 ? 's' : ''} in{' '}
            <code className="font-mono text-xs">{sampleImagesDir}</code>
          </p>
          <button
            className="text-sm px-3 py-1 rounded-full bg-ink text-cream hover:bg-black"
            onClick={() => loadSampleFiles().then(onDrop)}
          >
            Load samples
          </button>
        </div>
      )}
      <label
        className={`block border-2 border-dashed rounded-xl p-16 text-center cursor-pointer transition-colors ${
          dragging ? 'border-ink bg-ink/5' : 'border-faint hover:border-ink/40'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
      >
        <input
          type="file"
          accept="image/*,.heic"
          multiple
          className="sr-only"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <p className="text-xl text-muted">Drop photos here or click to browse</p>
        <p className="text-sm text-faint mt-2">JPG · PNG · HEIC — any batch size</p>
      </label>
    </div>
  );
}

// ── StageTimeline ────────────────────────────────────────────────────────────

function StageTimeline({ snapshots, running, progress, selected, onSelect }) {
  return (
    <div className="flex gap-2 flex-wrap">
      {STAGE_ORDER.map((stage) => {
        const snap = snapshots[stage];
        const isActive = running && progress?.stage === stage;
        const isDone = !!snap;
        const isSelected = selected === stage;

        return (
          <button
            key={stage}
            onClick={() => snap && onSelect(stage)}
            disabled={!snap}
            className={`flex-1 min-w-[100px] px-3 py-2.5 rounded-lg border text-left transition-colors ${
              isSelected
                ? 'border-ink bg-ink text-cream'
                : isDone
                ? 'border-faint bg-white hover:border-ink/50 cursor-pointer'
                : 'border-faint bg-white/50 opacity-40 cursor-default'
            }`}
          >
            <div className="flex items-center gap-1.5 mb-0.5">
              <span
                className={`inline-block w-2 h-2 rounded-full shrink-0 ${
                  isActive
                    ? 'bg-amber-400 animate-pulse'
                    : isDone
                    ? 'bg-green-500'
                    : 'bg-faint'
                }`}
              />
              <span className="text-xs font-medium uppercase tracking-wide truncate">
                {STAGE_LABELS[stage]}
              </span>
            </div>
            <div className="text-xs font-mono opacity-80 truncate">
              {snap ? stageStat(stage, snap) : '—'}
            </div>
            {snap?.timing != null && (
              <div className="text-xs font-mono opacity-50 mt-0.5">{snap.timing}ms</div>
            )}
          </button>
        );
      })}
    </div>
  );
}

function stageStat(stage, snap) {
  switch (stage) {
    case 'exif':         return `${snap.count} photos`;
    case 'dedup':        return `${snap.keptCount} kept · ${snap.exactCount + snap.burstCount} removed`;
    case 'embedding':    return snap.embeddedCount != null
      ? `${snap.embeddedCount} embedded · ${snap.nullCount} skipped`
      : 'skipped';
    case 'cluster':      return `${snap.clusterCount} clusters`;
    case 'aestheticScore': return snap.scoredCount != null && snap.scoredCount > 0
      ? `${snap.scoredCount} scored · avg ${snap.avgScore?.toFixed(3) ?? '—'}`
      : 'skipped';
    case 'heroSelect':   return `${snap.heroCount} hero${snap.heroCount !== 1 ? 's' : ''}`;
    case 'chapterBuilder': return `${snap.chapterCount} chapters · ${snap.selectedCount} photos`;
    case 'thumbnail':    return `${snap.generatedCount} ok · ${snap.failedCount} failed`;
    case 'qualityScore': return `avg ${snap.avgScore?.toFixed(3) ?? '—'}`;
    default: return '';
  }
}

// ── CacheControl ─────────────────────────────────────────────────────────────
// Shows how many scores the proxy has cached and lets you wipe it, so the next
// run re-scores from scratch. Hidden when the proxy is unreachable.

function CacheControl() {
  const [count, setCount] = useState(null); // null = unknown / proxy down
  const [busy, setBusy] = useState(false);
  const [cleared, setCleared] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(`${AESTHETIC_SERVER}/api/aesthetic/health`, {
          signal: AbortSignal.timeout(2000),
        });
        const body = res.ok ? await res.json() : null;
        if (active) setCount(typeof body?.cached === 'number' ? body.cached : null);
      } catch {
        if (active) setCount(null);
      }
    })();
    return () => { active = false; };
  }, []);

  const clear = async () => {
    setBusy(true);
    try {
      const res = await fetch(`${AESTHETIC_SERVER}/api/aesthetic/cache`, { method: 'DELETE' });
      if (res.ok) {
        setCount(0);
        setCleared(true);
      }
    } catch {
      // Proxy went away mid-clear — leave the count as-is.
    } finally {
      setBusy(false);
    }
  };

  // Proxy unreachable or didn't report a count — nothing to control.
  if (count == null) return null;

  return (
    <div className="flex items-center justify-end gap-3 text-xs text-muted">
      <span className="font-mono">
        Score cache: {count} {count === 1 ? 'entry' : 'entries'}
        {cleared && count === 0 && <span className="ml-1 not-italic">· cleared</span>}
      </span>
      <button
        onClick={clear}
        disabled={busy || count === 0}
        className="underline underline-offset-2 disabled:opacity-40 disabled:no-underline"
      >
        {busy ? 'Clearing…' : 'Clear cache'}
      </button>
    </div>
  );
}

// ── VoteTally ────────────────────────────────────────────────────────────────
// Running count of how many photos you preferred from each model. Aggregates
// the per-photo votes so the A/B contrast resolves into a scoreboard.

function VoteTally({ snapshots, votes }) {
  const labels = snapshots.aestheticScore?.modelLabels ?? [];
  if (labels.length === 0) return null;

  const counts = labels.map((label) => ({
    label,
    count: Object.values(votes).filter((v) => v === label).length,
  }));
  const total = counts.reduce((s, c) => s + c.count, 0);
  const leader = total > 0 ? Math.max(...counts.map((c) => c.count)) : 0;

  return (
    <div className="rounded-lg border border-faint bg-white px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-muted uppercase tracking-wide">Preferred model</p>
        <p className="text-xs text-muted font-mono">
          {total} vote{total !== 1 ? 's' : ''}
        </p>
      </div>
      <div className="space-y-1.5">
        {counts.map(({ label, count }) => {
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          const isLeader = total > 0 && count === leader;
          return (
            <div key={label} className="flex items-center gap-3">
              <span className={`text-sm w-48 shrink-0 truncate ${isLeader ? 'text-ink font-medium' : 'text-muted'}`}>
                {label}
              </span>
              <div className="flex-1 h-2 rounded-full bg-faint overflow-hidden">
                <div
                  className={`h-full rounded-full ${isLeader ? 'bg-ink' : 'bg-ink/40'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-sm font-mono text-ink w-14 text-right shrink-0">
                {count} · {pct}%
              </span>
            </div>
          );
        })}
      </div>
      {total === 0 && (
        <p className="text-xs text-muted mt-2">
          Select a photo below and pick the model whose score you trust more.
        </p>
      )}
    </div>
  );
}

// ── ModelComparison ──────────────────────────────────────────────────────────
// Side-by-side scoring from each configured vision model, for the selected
// photo. Provider A (models[0]) is the one heroSelect actually uses; the rest
// are here purely to make the A/B contrast visible. Click a card to vote for
// the model you think scored this photo better.

function ModelComparison({ snapshots, photoId, vote, onVote }) {
  const snap = snapshots.aestheticScore;
  const labels = snap?.modelLabels ?? [];

  // Stage ran but produced no scores at all (proxy down / feature off).
  if ((snap?.scoredCount ?? 0) === 0 && labels.length === 0) return null;

  if (!photoId) {
    return (
      <div className="rounded-lg border border-dashed border-ink/30 bg-white px-4 py-3 text-sm text-muted">
        Select a photo below to compare model scores side by side.
      </div>
    );
  }

  const photo = snap?.perPhoto?.[photoId];
  const models = photo?.models ?? null;

  if (!models || models.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-ink/30 bg-white px-4 py-3 text-sm text-muted">
        This photo was pre-filtered out before vision scoring — no model scores to compare.
      </div>
    );
  }

  return (
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: `repeat(${Math.min(models.length, 2)}, minmax(0, 1fr))` }}
    >
      {models.map((m, i) => {
        const label = m.model ?? `Model ${i + 1}`;
        const isVoted = vote != null && vote === m.model;
        return (
          <button
            key={m.model ?? i}
            type="button"
            onClick={() => onVote(photoId, m.model)}
            className={`text-left rounded-xl border bg-white px-4 py-3 transition-all cursor-pointer ${
              isVoted
                ? 'border-ink ring-2 ring-ink ring-offset-1'
                : 'border-ink/20 hover:border-ink/50'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-ink">
                Model: {label}
                {i === 0 && <span className="ml-2 text-[10px] uppercase tracking-wide text-muted">primary</span>}
              </p>
              {isVoted && (
                <span className="text-[10px] uppercase tracking-wide font-medium text-cream bg-ink rounded-full px-2 py-0.5 shrink-0">
                  ★ preferred
                </span>
              )}
            </div>
            <p className="text-sm font-mono mt-1.5 flex items-center gap-2">
              <span>Score:</span>
              <span
                className="px-1.5 py-0.5 rounded text-white"
                style={{ backgroundColor: scoreToColor(m.score) }}
              >
                {m.score != null ? m.score.toFixed(3) : '—'}
              </span>
              {m.keep != null && (
                <span className="text-muted">keep: {String(m.keep)}</span>
              )}
              {m.cached && (
                <span className="text-[10px] uppercase tracking-wide text-muted" title="Served from the proxy cache — no LLM call">
                  cached
                </span>
              )}
            </p>
            <p className="text-sm text-muted mt-1.5">
              Reason: {m.reason ? <span className="italic text-ink">“{m.reason}”</span> : '—'}
            </p>
            <p className="text-[11px] text-muted mt-2">
              {isVoted ? 'Click again to clear your vote' : 'Click to prefer this model'}
            </p>
          </button>
        );
      })}
    </div>
  );
}

// ── StageStats ───────────────────────────────────────────────────────────────

function StageStats({ stage, snapshots }) {
  const snap = snapshots[stage];
  if (!snap) return null;

  let lines = [];
  switch (stage) {
    case 'exif': {
      const photos = Object.values(snap.perPhoto);
      const withDate = photos.filter((p) => p.date).length;
      const withGPS  = photos.filter((p) => p.hasGPS).length;
      lines = [`${snap.count} photos · ${withDate} with timestamp · ${withGPS} with GPS`];
      break;
    }
    case 'dedup':
      lines = [
        `${snap.keptCount} unique · ${snap.exactCount} exact duplicate${snap.exactCount !== 1 ? 's' : ''} · ${snap.burstCount} burst candidate${snap.burstCount !== 1 ? 's' : ''}`,
        'Burst candidates are perceptually similar photos (hamming distance ≤ 5). Score shown is the distance.',
      ];
      break;
    case 'embedding': {
      if (snap.embeddedCount == null || (snap.embeddedCount === 0 && snap.nullCount === 0)) {
        lines = ['Embedding stage was not run (semantic clustering is off).'];
      } else if (snap.nullCount > 0 && snap.embeddedCount === 0) {
        lines = [
          'Embedding server was unreachable — all embeddings are null.',
          'Start the server (see docs/ai-embedding-server.md) and run again for semantic clustering.',
        ];
      } else {
        lines = [
          `CLIP ViT-B/32 embedded ${snap.embeddedCount} photo${snap.embeddedCount !== 1 ? 's' : ''} as 512-dim L2-normalised vectors.${snap.nullCount > 0 ? ` ${snap.nullCount} failed (decode error or server timeout).` : ''}`,
          'Vectors are used by the Cluster stage — cosine similarity groups visually similar photos together.',
        ];
      }
      break;
    }
    case 'cluster': {
      const isSemantic = snap.clusterCount > 0 && snapshots.embedding?.embeddedCount > 0;
      const mode = isSemantic ? 'visual content (CLIP k-means)' : 'calendar day';
      lines = [`${Object.keys(snap.perPhoto).length} photos → ${snap.clusterCount} clusters (grouped by ${mode}).`];
      break;
    }
    case 'aestheticScore': {
      if (snap.scoredCount === 0 && snap.skippedCount === 0) {
        lines = ['Aesthetic stage was not run (FEATURES.aestheticScoring is off).'];
      } else if (snap.scoredCount === 0) {
        lines = [
          'Aesthetic proxy was unreachable — all scores are null.',
          'Start the proxy (see docs/ai-aesthetic-proxy.md) and run again.',
        ];
      } else {
        lines = [
          `Vision model scored ${snap.scoredCount} photo${snap.scoredCount !== 1 ? 's' : ''} (${snap.skippedCount} pre-filtered out by cheap Laplacian).`,
          `Range: ${snap.minScore?.toFixed(3) ?? '—'} – ${snap.maxScore?.toFixed(3) ?? '—'} · avg ${snap.avgScore?.toFixed(3) ?? '—'}.`,
          'Click any scored photo to see the model’s one-line reason.',
        ];
      }
      break;
    }
    case 'heroSelect':
      lines = [`${snap.heroCount} hero${snap.heroCount !== 1 ? 's' : ''} selected using middle-photo heuristic. Stars mark heroes.`];
      break;
    case 'chapterBuilder': {
      const roles = Object.values(snap.perPhoto);
      const burstOnly = roles.filter((r) => r.role === 'burst-only').length;
      lines = [
        `${snap.chapterCount} chapters · ${snap.selectedCount} photos in story · ${burstOnly} burst-only (thumbnails generated, not shown in story).`,
      ];
      break;
    }
    case 'thumbnail':
      lines = [
        `${snap.generatedCount} thumbnails at 200px JPEG.${snap.failedCount > 0 ? ` ${snap.failedCount} failed (likely HEIC).` : ''}`,
        'Score is raw Laplacian variance — the unscaled blur signal. Higher = sharper. Compare with Quality stage to see normalization.',
      ];
      break;
    case 'qualityScore':
      lines = [
        `Score = sigmoid(variance − 200) × 0.01, normalised 0–1. Sharp photos typically > 0.7, blurry < 0.4.`,
        `Range: ${snap.minScore?.toFixed(3) ?? '—'} – ${snap.maxScore?.toFixed(3) ?? '—'} · avg ${snap.avgScore?.toFixed(3) ?? '—'}`,
      ];
      break;
    default: break;
  }

  return (
    <div className="rounded-lg border border-faint bg-white px-4 py-3 space-y-1">
      {lines.map((l, i) => (
        <p key={i} className="text-sm text-muted">{l}</p>
      ))}
    </div>
  );
}

// ── PhotoGrid ────────────────────────────────────────────────────────────────

function PhotoGrid({ snapshots, stage, getPreviewUrl, sortByScore, onToggleSort, selectedPhotoId, onSelectPhoto }) {
  const exifSnap = snapshots.exif;
  if (!exifSnap) return null;

  const allIds = Object.keys(exifSnap.perPhoto);
  const sorted = sortByScore ? sortIds(allIds, stage, snapshots) : allIds;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-muted uppercase tracking-wide">
          {allIds.length} photos · {STAGE_LABELS[stage] ?? stage}
          {selectedPhotoId && <span className="ml-2 normal-case">· click to deselect</span>}
        </p>
        <button className="text-xs text-muted underline underline-offset-2" onClick={onToggleSort}>
          {sortByScore ? 'Original order' : 'Sort by score'}
        </button>
      </div>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))' }}>
        {sorted.map((id) => (
          <PhotoCard
            key={id}
            photoId={id}
            stage={stage}
            snapshots={snapshots}
            getPreviewUrl={getPreviewUrl}
            isSelected={id === selectedPhotoId}
            onSelect={() => onSelectPhoto(id === selectedPhotoId ? null : id)}
          />
        ))}
      </div>
    </div>
  );
}

function sortIds(ids, stage, snapshots) {
  return [...ids].sort((a, b) => {
    const sa = getNumericScore(a, stage, snapshots);
    const sb = getNumericScore(b, stage, snapshots);
    if (sa == null && sb == null) return 0;
    if (sa == null) return 1;
    if (sb == null) return -1;
    return sb - sa; // descending
  });
}

function getNumericScore(id, stage, snapshots) {
  const snap = snapshots[stage];
  if (!snap) return null;
  const p = snap.perPhoto?.[id];
  if (!p) return null;
  switch (stage) {
    case 'dedup':
      if (p.status === 'kept')  return 1;
      if (p.status === 'exact') return 0;
      if (p.status === 'burst') return p.score != null ? Math.max(0, 1 - p.score / 20) : 0.5;
      return null;
    case 'embedding':
      return p.embedded ? 1 : 0;
    case 'heroSelect':
      return p.isHero ? 1 : 0;
    case 'cluster':
      return p.clusterIdx != null ? p.clusterIdx : null; // sort by group
    case 'chapterBuilder':
      return p.chapterIdx != null ? p.chapterIdx : (p.role === 'burst-only' ? 999 : null);
    case 'thumbnail':
      return p.rawVariance ?? (p.status === 'ok' ? 0 : -1);
    case 'qualityScore':
      return p.score;
    case 'aestheticScore':
      return p.score;
    default:
      return null;
  }
}

// ── PhotoCard ────────────────────────────────────────────────────────────────

function PhotoCard({ photoId, stage, snapshots, getPreviewUrl, isSelected, onSelect }) {
  const thumbSnap = snapshots.thumbnail?.perPhoto?.[photoId];
  const imgUrl = thumbSnap?.thumbnailUrl ?? getPreviewUrl(photoId);
  const exifData = snapshots.exif?.perPhoto?.[photoId];
  const annotation = getAnnotation(photoId, stage, snapshots);

  const stageSnap = snapshots[stage];
  const inStage = !stageSnap || stageSnap.perPhoto?.[photoId] != null;

  const clusterIdx = stage === 'cluster'
    ? (snapshots.cluster?.perPhoto?.[photoId]?.clusterIdx ?? null)
    : null;

  return (
    <div
      onClick={onSelect}
      className={`relative rounded overflow-hidden border bg-white aspect-square transition-all cursor-pointer ${
        isSelected
          ? 'border-ink ring-2 ring-ink ring-offset-1'
          : clusterIdx != null
          ? 'border-faint'
          : 'border-faint hover:border-ink/40'
      } ${inStage ? '' : 'opacity-20'}`}
      style={
        !isSelected && clusterIdx != null
          ? { borderColor: CLUSTER_PALETTE[clusterIdx % CLUSTER_PALETTE.length], borderWidth: 2 }
          : undefined
      }
    >
      {imgUrl ? (
        <img src={imgUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
      ) : (
        <div className="w-full h-full flex items-center justify-center p-2">
          <span className="text-xs text-muted text-center break-all leading-tight">
            {exifData?.name ?? photoId}
          </span>
        </div>
      )}

      {stage === 'heroSelect' && snapshots.heroSelect?.perPhoto?.[photoId]?.isHero && (
        <div className="absolute top-1 right-1 text-sm leading-none drop-shadow">★</div>
      )}

      {annotation && (
        <div className="absolute bottom-0 inset-x-0">
          {annotation.overlay && (
            <div className="px-1.5 py-0.5 text-white text-xs font-mono leading-tight truncate bg-black/60">
              {annotation.overlay}
            </div>
          )}
          <div
            className="px-1.5 py-0.5 text-white text-xs font-mono leading-tight truncate"
            style={{ backgroundColor: annotation.color + 'dd' }}
          >
            {annotation.label}
          </div>
        </div>
      )}
    </div>
  );
}

// ── PhotoDetail ───────────────────────────────────────────────────────────────

function PhotoDetail({ photoId, stage, snapshots, getPreviewUrl, onClose }) {
  const exif = snapshots.exif?.perPhoto?.[photoId];
  const thumbSnap = snapshots.thumbnail?.perPhoto?.[photoId];
  const imgUrl = thumbSnap?.thumbnailUrl ?? getPreviewUrl(photoId);

  if (!exif) return null;

  const rows = [
    ['File',     exif.name],
    ['Size',     exif.size != null ? fmtBytes(exif.size) : null],
    ['Date',     exif.timestamp ? new Date(exif.timestamp).toLocaleString() : null],
    ['GPS',      exif.coords ? `${exif.coords.lat.toFixed(5)}, ${exif.coords.lng.toFixed(5)}` : null],
    ['Camera',   [exif.make, exif.model].filter(Boolean).join(' ') || null],
    ['Lens',     exif.lensModel],
    ['ISO',      exif.iso != null ? String(exif.iso) : null],
    ['Aperture', exif.fNumber != null ? `f/${exif.fNumber}` : null],
    ['Shutter',  exif.exposureTime != null ? fmtExposure(exif.exposureTime) : null],
    ['Dimensions', exif.width && exif.height ? `${exif.width} × ${exif.height}` : null],
    ['Orientation', exif.orientation != null ? String(exif.orientation) : null],
  ].filter(([, v]) => v != null);

  // Aesthetic detail: the model's score + one-line reason. Visible whenever
  // the photo was scored, not only when the Aesthetic stage is selected, so
  // you can correlate it with hero picks from the Hero tab.
  const aestheticSnap = snapshots.aestheticScore?.perPhoto?.[photoId];
  const aestheticVisible = aestheticSnap && aestheticSnap.score != null;

  // Dedup pair view: when inspecting a burst photo, show its matched rep;
  // when inspecting a kept rep that absorbed candidates, show them.
  const dedupSnap = snapshots.dedup?.perPhoto?.[photoId];
  const dedupPairs = (() => {
    if (stage !== 'dedup' || !dedupSnap) return null;
    if (dedupSnap.status === 'burst' && dedupSnap.matchedRepId) {
      return { heading: 'Matched representative', items: [{ id: dedupSnap.matchedRepId, dist: dedupSnap.score }] };
    }
    if (dedupSnap.status === 'kept' && dedupSnap.candidates?.length) {
      return { heading: 'Burst candidates absorbed', items: dedupSnap.candidates };
    }
    return null;
  })();

  return (
    <div className="rounded-lg border border-ink/20 bg-white overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-faint">
        <p className="text-sm font-mono text-ink truncate">{exif.name}</p>
        <button
          onClick={onClose}
          className="text-muted hover:text-ink ml-4 shrink-0 text-lg leading-none"
        >
          ✕
        </button>
      </div>
      <div className="flex gap-0 divide-x divide-faint">
        {imgUrl && (
          <div className="shrink-0 w-36 h-36">
            <img src={imgUrl} alt="" className="w-full h-full object-cover" />
          </div>
        )}
        {stage === 'dedup' && dedupSnap?.dHashThumbnailUrl && (
          <div className="shrink-0 w-36 h-36 flex flex-col items-center justify-center bg-faint/40">
            <img
              src={dedupSnap.dHashThumbnailUrl}
              alt="dHash input (17×16 grayscale)"
              className="w-32 h-32 object-cover"
              style={{ imageRendering: 'pixelated' }}
            />
            <p className="text-[10px] font-mono text-muted mt-1">17×16 grayscale</p>
          </div>
        )}
        <div className="flex-1 px-4 py-3 grid grid-cols-2 gap-x-6 gap-y-0.5 content-start">
          {rows.map(([label, value]) => (
            <div key={label} className="flex gap-2 col-span-1">
              <dt className="text-xs text-muted shrink-0 w-20">{label}</dt>
              <dd className="text-xs font-mono text-ink truncate">{value}</dd>
            </div>
          ))}
        </div>
      </div>
      {aestheticVisible && (
        <div className="px-4 py-3 border-t border-faint">
          <p className="text-xs text-muted uppercase tracking-wide mb-1.5">Aesthetic (vision)</p>
          <div className="flex items-center gap-3">
            <span
              className="text-xs font-mono px-1.5 py-0.5 rounded text-white"
              style={{ backgroundColor: scoreToColor(aestheticSnap.score) }}
            >
              {aestheticSnap.score.toFixed(3)}
            </span>
            <span className="text-xs font-mono text-muted">
              keep: {aestheticSnap.keep == null ? '—' : String(aestheticSnap.keep)}
            </span>
            {aestheticSnap.reason && (
              <span className="text-xs text-ink italic">“{aestheticSnap.reason}”</span>
            )}
          </div>
        </div>
      )}
      {dedupPairs && (
        <div className="px-4 py-3 border-t border-faint">
          <p className="text-xs text-muted uppercase tracking-wide mb-2">{dedupPairs.heading}</p>
          <div className="flex gap-2 flex-wrap">
            {dedupPairs.items.map(({ id, dist }) => {
              const pairThumb = snapshots.thumbnail?.perPhoto?.[id]?.thumbnailUrl ?? getPreviewUrl(id);
              const pairName = snapshots.exif?.perPhoto?.[id]?.name ?? id;
              const pairDHash = snapshots.dedup?.perPhoto?.[id]?.dHashThumbnailUrl;
              return (
                <div key={id} className="shrink-0 w-24">
                  <div className="flex gap-1">
                    {pairThumb ? (
                      <img src={pairThumb} alt="" className="w-24 h-24 object-cover rounded border border-faint" />
                    ) : (
                      <div className="w-24 h-24 rounded border border-faint bg-faint" />
                    )}
                  </div>
                  {pairDHash && (
                    <img
                      src={pairDHash}
                      alt=""
                      className="w-24 h-24 object-cover rounded border border-faint mt-1"
                      style={{ imageRendering: 'pixelated' }}
                    />
                  )}
                  <p className="text-[10px] font-mono text-ink truncate mt-1">{pairName}</p>
                  <p className="text-[10px] font-mono text-muted">d={dist ?? '?'}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function fmtBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtExposure(t) {
  if (t >= 1) return `${t}s`;
  const denom = Math.round(1 / t);
  return `1/${denom}s`;
}

function getAnnotation(photoId, stage, snapshots) {
  const snap = snapshots[stage];
  if (!snap) return null;
  const p = snap.perPhoto?.[photoId];

  switch (stage) {
    case 'exif': {
      if (!p) return null;
      const parts = [];
      if (p.date) parts.push(p.date.slice(5)); // MM-DD
      if (p.hasGPS) parts.push('GPS');
      if (!parts.length) parts.push('no meta');
      const score = p.date ? (p.hasGPS ? 1 : 0.6) : 0.2;
      return { label: parts.join(' · '), color: scoreToColor(score) };
    }

    case 'dedup': {
      if (!p) return { label: 'n/a', color: '#9ca3af' };
      const distOverlay = p.score != null ? `d=${p.score}` : null;
      if (p.status === 'kept')  return { label: 'kept',  color: scoreToColor(1), overlay: distOverlay };
      if (p.status === 'exact') return { label: 'exact', color: scoreToColor(0), overlay: null };
      if (p.status === 'burst') {
        return {
          label: 'burst',
          color: scoreToColor(p.score != null ? Math.max(0, 1 - p.score / 20) : 0.5),
          overlay: distOverlay,
        };
      }
      return null;
    }

    case 'embedding': {
      if (!p) return { label: 'skipped', color: '#9ca3af' };
      return p.embedded
        ? { label: 'embed ok', color: '#3b82f6' }
        : { label: 'null', color: '#ef4444' };
    }

    case 'cluster': {
      if (!p) return { label: 'removed', color: '#9ca3af' };
      return {
        label: `cluster ${p.clusterIdx + 1}`,
        color: CLUSTER_PALETTE[p.clusterIdx % CLUSTER_PALETTE.length],
      };
    }

    case 'heroSelect': {
      if (!p) return { label: 'removed', color: '#9ca3af' };
      return p.isHero
        ? { label: 'hero',    color: '#d97706' }
        : { label: 'regular', color: '#6b7280' };
    }

    case 'chapterBuilder': {
      if (!p) return { label: 'removed', color: '#9ca3af' };
      if (p.role === 'burst-only') return { label: 'burst only', color: '#7c3aed' };
      const label = p.chapterId
        ? `ch.${p.chapterIdx + 1}${p.isHero ? ' ★' : ''}`
        : 'n/a';
      return { label, color: p.isHero ? '#d97706' : '#3b82f6' };
    }

    case 'thumbnail': {
      if (!p) return { label: 'no thumb', color: '#9ca3af' };
      if (p.status === 'failed') return { label: 'failed', color: scoreToColor(0) };
      const variance = p.rawVariance;
      if (variance != null) {
        const score = 1 / (1 + Math.exp(-0.01 * (variance - 200)));
        return { label: `var ${Math.round(variance)}`, color: scoreToColor(score) };
      }
      return { label: 'ok', color: scoreToColor(0.5) };
    }

    case 'qualityScore': {
      if (!p) return { label: 'no score', color: '#9ca3af' };
      const score = p.score;
      return {
        label: score != null ? score.toFixed(3) : 'null',
        color: scoreToColor(score),
      };
    }

    case 'aestheticScore': {
      if (!p) return { label: 'no score', color: '#9ca3af' };
      const score = p.score;
      if (score == null) return { label: 'skipped', color: '#9ca3af' };
      return {
        label: score.toFixed(3),
        color: scoreToColor(score),
        overlay: p.reason ? p.reason : null,
      };
    }

    default:
      return null;
  }
}
