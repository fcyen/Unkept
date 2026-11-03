import { useCallback, useEffect, useRef, useState } from 'react';
import { PHASES } from '../lib/pipeline/orchestrator.js';
import { usePipelineDebug, STAGE_ORDER, STAGE_LABELS } from './usePipelineDebug.js';
import { usePipelineDemo } from './usePipelineDemo.js';
import { stageViewState, modelErrorCopy, compareModels } from './pipelineStates.js';
import { loadVotes, saveVotes, storageKey, toggleVote, tally } from './voteStore.js';
import { DEMO_MODE, DEMO_FIXTURE_URL } from '../lib/demoMode.js';
import { buildDemoFixture, buildDisplayImages } from './demoFixture.js';
import sampleImageUrls, { sampleImagesDir } from 'virtual:sample-images';

// The aesthetic proxy (same host the aestheticScore stage posts to). Only
// ever contacted in live mode — the demo build never touches it.
const AESTHETIC_SERVER = 'http://localhost:3001';
const REPO_URL = 'https://github.com/fcyen/Unkept';

const CLUSTER_PALETTE = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#f97316',
];

function scoreToColor(score) {
  if (score == null) return '#9ca3af';
  const c = Math.max(0, Math.min(1, score));
  if (c >= 0.7) return '#16a34a';
  if (c >= 0.4) return '#d97706';
  return '#dc2626';
}

async function loadSampleFiles() {
  return Promise.all(
    sampleImageUrls.map(async (url) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Couldn’t load sample image ${url} (HTTP ${res.status})`);
      const blob = await res.blob();
      const name = decodeURIComponent(url.split('/').pop());
      const type = blob.type || (name.match(/\.heic$/i) ? 'image/heic' : 'image/jpeg');
      return new File([blob], name, { type });
    }),
  );
}

function safeLocalStorage() {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export default function PipelineDebugRoute() {
  return DEMO_MODE ? <DemoInspector /> : <LiveInspector />;
}

// ── Live mode: runs the real pipeline in this browser ───────────────────────

function LiveInspector() {
  const {
    phase, progress, snapshots, error, run, reset, getPreviewUrl, revokeAll,
    useSemanticClustering, setUseSemanticClustering,
  } = usePipelineDebug();
  const [userDidReset, setUserDidReset] = useState(false);
  // Votes are session-only in live mode — a quick way to A/B-judge two models.
  const [votes, setVotes] = useState({});
  const autoStarted = useRef(false);

  useEffect(() => () => revokeAll(), [revokeAll]);

  // Auto-load sample images on first mount. Skipped if the user clicked
  // "New run" (userDidReset), since they want to choose photos manually.
  useEffect(() => {
    if (autoStarted.current || userDidReset || sampleImageUrls.length === 0) return;
    autoStarted.current = true;
    loadSampleFiles().then(run).catch((err) => console.error(err));
  }, [run, userDidReset]);

  const handleNewRun = () => {
    reset();
    setUserDidReset(true);
    setVotes({});
  };

  // Build the DEMO_MODE fixture from this run. Exposed on window so
  // scripts/build-demo-fixture.mjs drives the exact same code path.
  const exportFixture = useCallback(async (generator = 'browser export') => {
    // The finished run's snapshots (set when runPhase1 resolves) — never a
    // mid-render copy of React state.
    const snaps = window.__pipelineSnapshots ?? snapshots;
    return buildDemoFixture({
      snapshots: snaps,
      images: await buildDisplayImages(sampleImageUrls, snaps),
      generator,
    });
  }, [snapshots]);
  useEffect(() => {
    window.__exportDemoFixture = exportFixture;
    return () => { delete window.__exportDemoFixture; };
  }, [exportFixture]);

  return (
    <InspectorView
      mode="live"
      phase={phase}
      progress={progress}
      snapshots={snapshots}
      error={error}
      getPreviewUrl={getPreviewUrl}
      votes={votes}
      onVote={(id, model) => setVotes((v) => toggleVote(v, id, model))}
      onResetVotes={() => setVotes({})}
      onRetry={handleNewRun}
      retryLabel="Start a new run"
      loadingLabel={sampleImageUrls.length > 0
        ? `Loading ${sampleImageUrls.length} sample image${sampleImageUrls.length !== 1 ? 's' : ''}…`
        : 'Reading EXIF data…'}
      idle={phase === PHASES.IDLE && <DropZone onDrop={run} hasSamples={sampleImageUrls.length > 0} />}
      headerControls={(
        <>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <span className="text-sm text-muted">Semantic clustering</span>
            <button
              role="switch"
              aria-checked={useSemanticClustering}
              aria-label="Semantic clustering"
              onClick={() => setUseSemanticClustering((v) => !v)}
              className={`relative w-9 h-5 rounded-full transition-colors ${useSemanticClustering ? 'bg-ink' : 'bg-faint'}`}
            >
              <span
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${useSemanticClustering ? 'translate-x-4' : 'translate-x-0.5'}`}
              />
            </button>
          </label>
          {phase === PHASES.DONE && sampleImageUrls.length > 0 && (
            <ExportFixtureButton exportFixture={exportFixture} />
          )}
          {phase !== PHASES.IDLE && (
            <button className="text-sm text-muted underline underline-offset-2 hover:text-ink" onClick={handleNewRun}>
              New run
            </button>
          )}
        </>
      )}
      extraAesthetic={<CacheControl />}
    />
  );
}

// Downloads pipeline-fixture.json built from this run, and reports how many
// model scores came from the cache so a zero-hit export is obvious.
function ExportFixtureButton({ exportFixture }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const run = async () => {
    setBusy(true);
    setResult(null);
    try {
      const fixture = await exportFixture();
      const blob = new Blob([JSON.stringify(fixture)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'pipeline-fixture.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setResult({ ok: true, ...fixture.meta.source });
    } catch (err) {
      setResult({ ok: false, message: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="flex items-center gap-2 text-sm">
      <button onClick={run} disabled={busy} className="text-muted underline underline-offset-2 hover:text-ink disabled:opacity-40">
        {busy ? 'Exporting…' : 'Export demo fixture'}
      </button>
      {result && (
        <span className={`text-xs font-mono ${result.ok && result.cacheHits > 0 ? 'text-green-700' : 'text-red-700'}`}>
          {result.ok
            ? `${result.cacheHits} hits · ${result.cacheMisses} misses${result.cacheHits ? ' → save to client/public/demo/' : ' — models not bundled'}`
            : `failed: ${result.message}`}
        </span>
      )}
    </span>
  );
}

// ── Demo mode: replays the precomputed fixture, no API calls ───────────────

function DemoInspector() {
  const { phase, progress, snapshots, error, getPreviewUrl, retry, meta } = usePipelineDemo(DEMO_FIXTURE_URL);
  const key = storageKey(meta?.version);
  const [votes, setVotes] = useState({});

  // Votes live in this browser's localStorage only — never sent anywhere.
  useEffect(() => {
    if (meta) setVotes(loadVotes(safeLocalStorage(), key));
  }, [meta, key]);

  const update = (next) => {
    saveVotes(safeLocalStorage(), key, next);
    return next;
  };

  return (
    <InspectorView
      mode="demo"
      phase={phase}
      progress={progress}
      snapshots={snapshots}
      error={error}
      getPreviewUrl={getPreviewUrl}
      votes={votes}
      onVote={(id, model) => setVotes((v) => update(toggleVote(v, id, model)))}
      onResetVotes={() => setVotes(() => update({}))}
      onRetry={retry}
      retryLabel="Try again"
      loadingLabel="Loading precomputed results…"
      meta={meta}
    />
  );
}

// ── Shared view ─────────────────────────────────────────────────────────────

function InspectorView({
  mode, phase, progress, snapshots, error, getPreviewUrl, votes, onVote, onResetVotes,
  onRetry, retryLabel, loadingLabel, idle, headerControls, extraAesthetic, meta,
}) {
  const isDemo = mode === 'demo';
  // The demo opens on the model comparison — the point of the page.
  const [selectedStage, setSelectedStage] = useState(isDemo ? 'aestheticScore' : 'qualityScore');
  const [sortByScore, setSortByScore] = useState(false);
  const [selectedPhotoId, setSelectedPhotoId] = useState(null);
  const autoSelected = useRef(false);
  const running = phase === PHASES.RUNNING;

  // Demo: pre-select the first photo both models scored so the side-by-side
  // comparison is visible without a click.
  const aesthetic = snapshots.aestheticScore;
  useEffect(() => {
    if (!isDemo || autoSelected.current || !aesthetic) return;
    autoSelected.current = true;
    const first = Object.entries(aesthetic.perPhoto ?? {})
      .find(([, p]) => (p.models ?? []).some((m) => m?.score != null));
    if (first) setSelectedPhotoId(first[0]);
  }, [isDemo, aesthetic]);

  const handleStageSelect = (stage) => {
    setSelectedStage(stage);
    // Keep the photo selected across stages — handy for following one photo
    // through the pipeline.
  };

  const stageState = stageViewState({
    stage: selectedStage, snapshots, running, progress, stageOrder: STAGE_ORDER,
  });
  const showAestheticTools = selectedStage === 'aestheticScore' && aesthetic
    && (stageState == null || stageState.kind === 'warning');

  return (
    <div className="min-h-screen bg-cream text-ink">
      <header className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 pb-4 sm:pt-8 sm:pb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {isDemo ? (
            <>
              <p className="text-[11px] uppercase tracking-[0.14em] text-muted">Unkept · selection pipeline</p>
              <h1 className="font-serif text-[1.75rem] sm:text-4xl leading-tight mt-1.5">
                Which vision model picks better keepers?
              </h1>
              <p className="text-sm sm:text-[15px] text-muted mt-2 max-w-2xl leading-relaxed">
                Step through each stage of an on-device photo-culling pipeline, then compare two
                vision models’ scores and reasoning on the same photos — and vote for the one you agree with.
              </p>
            </>
          ) : (
            <>
              <h1 className="font-serif text-3xl">/pipeline</h1>
              <p className="text-muted text-sm mt-1">Phase 1 inspector — per-photo scoring at every stage.</p>
            </>
          )}
        </div>
        {headerControls && <div className="flex items-center gap-4 flex-wrap shrink-0">{headerControls}</div>}
      </header>

      {isDemo && <DemoBanner meta={meta} />}

      {idle}

      {error && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 mb-5">
          <StatePanel
            state={{
              kind: 'error',
              title: isDemo ? 'The demo data didn’t load' : 'The pipeline stopped with an error',
              body: error.message,
            }}
            action={onRetry && (
              <button
                onClick={onRetry}
                className="mt-3 text-sm px-3 py-1.5 rounded-full bg-ink text-cream hover:bg-black"
              >
                {retryLabel}
              </button>
            )}
          />
        </div>
      )}

      {running && !snapshots.exif && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-12 space-y-4">
          <StatePanel state={{ kind: 'loading', title: loadingLabel, body: 'This takes a moment.' }} />
          <SkeletonGrid />
        </div>
      )}

      {snapshots.exif && (
        <main className="max-w-7xl mx-auto px-4 sm:px-6 pb-12 space-y-4 sm:space-y-5">
          <StageTimeline
            snapshots={snapshots}
            running={running}
            progress={progress}
            selected={selectedStage}
            onSelect={handleStageSelect}
          />
          {stageState ? <StatePanel state={stageState} /> : null}
          {(stageState == null || stageState.kind === 'warning') && (
            <StageStats stage={selectedStage} snapshots={snapshots} />
          )}
          {showAestheticTools && (
            <>
              {extraAesthetic}
              <VoteTally
                snapshots={snapshots}
                votes={votes}
                onReset={onResetVotes}
                persistNote={isDemo ? 'Saved in this browser only' : 'This session only'}
              />
              <ModelComparison
                snapshots={snapshots}
                photoId={selectedPhotoId}
                getPreviewUrl={getPreviewUrl}
                vote={votes[selectedPhotoId] ?? null}
                onVote={onVote}
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

      {isDemo && (
        <footer className="max-w-7xl mx-auto px-4 sm:px-6 pb-10 pt-2 text-xs text-muted flex flex-wrap gap-x-4 gap-y-1">
          <a href={REPO_URL} className="underline underline-offset-2 hover:text-ink">Source &amp; case study on GitHub</a>
          <a href="/" className="underline underline-offset-2 hover:text-ink">Try the app with your own photos</a>
        </footer>
      )}
    </div>
  );
}

// ── DemoBanner ──────────────────────────────────────────────────────────────

function DemoBanner({ meta }) {
  const n = meta?.photoCount;
  const models = meta?.models ?? [];
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 mb-4 sm:mb-5">
      <div className="rounded-lg bg-ink text-cream px-4 py-2.5 text-xs sm:text-[13px] flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium uppercase tracking-[0.12em] text-[11px]">Demo mode</span>
        <span className="opacity-80">
          Precomputed results{n ? ` for ${n} sample photos` : ''}
          {models.length >= 2 ? ` · ${models.join(' vs ')}` : ''}
          {' '}· no model API calls · votes stay in this browser
        </span>
      </div>
    </div>
  );
}

// ── StatePanel ──────────────────────────────────────────────────────────────
// One component for every loading / empty / error / warning state, so they
// look like siblings. Errors are announced (role=alert); the rest are polite.

const STATE_STYLES = {
  loading: 'border-faint bg-white',
  empty: 'border-dashed border-ink/25 bg-white/70',
  error: 'border-red-200 bg-red-50',
  warning: 'border-amber-200 bg-amber-50',
};

function StateIcon({ kind }) {
  if (kind === 'loading') {
    return <span className="mt-0.5 w-4 h-4 rounded-full border-2 border-ink/20 border-t-ink animate-spin shrink-0" aria-hidden="true" />;
  }
  const map = {
    empty: ['○', 'text-muted'],
    error: ['!', 'text-white bg-red-600'],
    warning: ['!', 'text-white bg-amber-600'],
  };
  const [glyph, cls] = map[kind] ?? map.empty;
  return (
    <span className={`mt-0.5 w-4 h-4 rounded-full shrink-0 flex items-center justify-center text-[11px] font-bold leading-none ${cls}`} aria-hidden="true">
      {glyph}
    </span>
  );
}

/** Render `backtick` spans in hint copy as inline code. */
function withCode(text) {
  return String(text).split('`').map((part, i) => (
    i % 2 === 1
      ? <code key={i} className="font-mono text-[0.92em] bg-ink/5 rounded px-1 py-px">{part}</code>
      : <span key={i}>{part}</span>
  ));
}

function StatePanel({ state, action, compact = false }) {
  if (!state) return null;
  const { kind, title, body, hint, pct } = state;
  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      aria-live={kind === 'error' ? 'assertive' : 'polite'}
      data-state={kind}
      className={`rounded-lg border ${compact ? 'px-3 py-2.5' : 'px-4 py-3.5'} ${STATE_STYLES[kind] ?? STATE_STYLES.empty}`}
    >
      <div className="flex gap-3">
        <StateIcon kind={kind} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink leading-snug">{title}</p>
          {body && <p className="text-sm text-muted mt-1 leading-relaxed">{body}</p>}
          {hint && <p className="text-xs text-muted mt-2 leading-relaxed break-words">{withCode(hint)}</p>}
          {pct != null && (
            <div className="mt-2.5 h-1.5 rounded-full bg-faint/40 overflow-hidden" aria-hidden="true">
              <div className="h-full bg-ink rounded-full transition-[width]" style={{ width: `${pct}%` }} />
            </div>
          )}
          {action}
        </div>
      </div>
    </div>
  );
}

function SkeletonGrid({ count = 12 }) {
  return (
    <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))' }} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="aspect-square rounded bg-faint/30 animate-pulse" />
      ))}
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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-4">
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
        className={`block border-2 border-dashed rounded-xl p-10 sm:p-16 text-center cursor-pointer transition-colors ${
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
// Scrolls horizontally on phones (one row, snap) and wraps on wider screens.

function stageHealth(stage, snap) {
  if (!snap) return 'pending';
  if (stage === 'aestheticScore') {
    if (snap.scoredCount === 0) return (snap.rateLimitedCount || snap.failedCount) ? 'error' : 'empty';
    if (snap.rateLimitedCount || snap.failedCount || snap.modelErrorCount) return 'warning';
  }
  if (stage === 'embedding' && !snap.embeddedCount) return 'empty';
  return 'done';
}

const DOT = {
  active: 'bg-amber-400 animate-pulse',
  done: 'bg-green-500',
  warning: 'bg-amber-500',
  error: 'bg-red-500',
  empty: 'bg-transparent ring-1 ring-inset ring-current opacity-60',
  pending: 'bg-faint',
};

function StageTimeline({ snapshots, running, progress, selected, onSelect }) {
  return (
    <nav aria-label="Pipeline stages" className="-mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto sm:overflow-visible">
      <ol className="flex gap-2 sm:flex-wrap pb-1 sm:pb-0 snap-x">
        {STAGE_ORDER.map((stage, i) => {
          const snap = snapshots[stage];
          const isActive = running && progress?.stage === stage;
          const health = isActive ? 'active' : stageHealth(stage, snap);
          const isSelected = selected === stage;

          return (
            <li key={stage} className="snap-start shrink-0 sm:shrink sm:flex-1 min-w-[116px] sm:min-w-[104px]">
              <button
                onClick={() => onSelect(stage)}
                aria-current={isSelected ? 'step' : undefined}
                className={`w-full h-full px-3 py-2.5 rounded-lg border text-left transition-colors ${
                  isSelected
                    ? 'border-ink bg-ink text-cream'
                    : snap
                    ? 'border-faint bg-white hover:border-ink/50'
                    : 'border-faint/70 bg-white/50 text-ink/50 hover:border-ink/30'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${DOT[health]}`} />
                  <span className="text-[11px] font-medium uppercase tracking-[0.08em] truncate">
                    <span className="opacity-50 mr-1 tabular-nums">{i + 1}</span>{STAGE_LABELS[stage]}
                  </span>
                </div>
                <div className="text-xs font-mono opacity-80 truncate">
                  {snap ? stageStat(stage, snap) : isActive ? 'running…' : '—'}
                </div>
                {snap?.timing != null && (
                  <div className="text-[11px] font-mono opacity-50 mt-0.5">{snap.timing}ms</div>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function stageStat(stage, snap) {
  switch (stage) {
    case 'exif':         return `${snap.count} photos`;
    case 'dedup':        return `${snap.keptCount} kept · ${snap.exactCount + snap.burstCount} removed`;
    case 'embedding':    return snap.embeddedCount
      ? `${snap.embeddedCount} embedded${snap.nullCount ? ` · ${snap.nullCount} skipped` : ''}`
      : 'skipped';
    case 'cluster':      return `${snap.clusterCount} clusters`;
    case 'aestheticScore': {
      if (snap.status === 'not_bundled') return 'not bundled';
      if (snap.status === 'unreachable') return 'proxy offline';
      if (snap.status === 'unconfigured') return 'no model set';
      if (snap.status === 'demo') return 'off (demo)';
      if (!snap.scoredCount) return snap.rateLimitedCount ? 'rate-limited' : snap.failedCount ? 'failed' : 'skipped';
      const models = snap.modelLabels?.length ?? 1;
      const issues = (snap.rateLimitedCount ?? 0) + (snap.failedCount ?? 0);
      return `${snap.scoredCount} scored${models > 1 ? ` · ${models} models` : ''}${issues ? ` · ${issues} err` : ''}`;
    }
    case 'heroSelect':   return `${snap.heroCount} hero${snap.heroCount !== 1 ? 'es' : ''}`;
    case 'chapterBuilder': return `${snap.chapterCount} chapters · ${snap.selectedCount} photos`;
    case 'thumbnail':    return `${snap.generatedCount} ok · ${snap.failedCount} failed`;
    case 'qualityScore': return `avg ${snap.avgScore?.toFixed(3) ?? '—'}`;
    default: return '';
  }
}

// ── CacheControl ─────────────────────────────────────────────────────────────
// Live mode only. Shows how many scores the proxy has cached and lets you
// wipe it, so the next run re-scores from scratch. Hidden when the proxy is
// unreachable.

function CacheControl() {
  const [count, setCount] = useState(null); // null = unknown / proxy down
  const [busy, setBusy] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [failed, setFailed] = useState(false);

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
    setFailed(false);
    try {
      const res = await fetch(`${AESTHETIC_SERVER}/api/aesthetic/cache`, { method: 'DELETE' });
      if (!res.ok) throw new Error(String(res.status));
      setCount(0);
      setCleared(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  if (count == null) return null;

  return (
    <div className="flex items-center justify-end gap-3 text-xs text-muted">
      <span className="font-mono">
        Score cache: {count} {count === 1 ? 'entry' : 'entries'}
        {cleared && count === 0 && <span className="ml-1">· cleared</span>}
        {failed && <span className="ml-1 text-red-700">· couldn’t clear — is the proxy still running?</span>}
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
// Your per-photo votes resolved into a scoreboard, next to the models' own
// head-to-head numbers (average score, keep/skip agreement, mean gap).

function VoteTally({ snapshots, votes, onReset, persistNote }) {
  const snap = snapshots.aestheticScore;
  const labels = snap?.modelLabels ?? [];
  if (labels.length === 0) return null;

  const { counts, total } = tally(labels, votes);
  const leader = total > 0 ? Math.max(...counts.map((c) => c.count)) : 0;
  const summary = compareModels(snap);

  return (
    <section aria-label="Model vote tally" className="rounded-lg border border-faint bg-white px-4 py-3.5">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 className="text-[11px] text-muted uppercase tracking-[0.12em] shrink-0">Your verdict</h2>
        <p className="text-xs text-muted font-mono flex items-center gap-2">
          <span>{total} vote{total !== 1 ? 's' : ''} · {persistNote}</span>
          {total > 0 && onReset && (
            <button onClick={onReset} className="underline underline-offset-2 hover:text-ink font-sans">Reset</button>
          )}
        </p>
      </div>
      <div className="space-y-2">
        {counts.map(({ label, count }) => {
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          const isLeader = total > 0 && count === leader;
          const avg = summary.models.find((m) => m.label === label)?.avg;
          return (
            <div key={label} className="grid grid-cols-[minmax(0,1fr)_5.5rem] sm:grid-cols-[13rem_minmax(0,1fr)_5.5rem] items-center gap-x-3 gap-y-1">
              <span className={`text-sm truncate ${isLeader ? 'text-ink font-medium' : 'text-muted'}`} title={label}>
                {label}
                {avg != null && <span className="ml-2 text-xs font-mono text-muted font-normal">avg {avg.toFixed(2)}</span>}
              </span>
              <span className="text-sm font-mono text-ink text-right tabular-nums sm:order-last">
                {count} · {pct}%
              </span>
              <div className="col-span-2 sm:col-span-1 h-2 rounded-full bg-faint/40 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-[width] ${isLeader ? 'bg-ink' : 'bg-ink/40'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      {summary.paired > 0 && (
        <p className="text-xs text-muted mt-3 leading-relaxed">
          On the {summary.paired} photo{summary.paired !== 1 ? 's' : ''} both models scored, they agree on keep/skip{' '}
          <span className="text-ink font-medium">{summary.agree} of {summary.paired}</span> times; scores differ by{' '}
          <span className="text-ink font-medium font-mono">{summary.meanGap.toFixed(2)}</span> on average.
        </p>
      )}
      {total === 0 && (
        <p className="text-xs text-muted mt-2">Pick a photo, read both verdicts, and tap the model you agree with.</p>
      )}
    </section>
  );
}

// ── ModelComparison ──────────────────────────────────────────────────────────
// Side-by-side scoring from each configured vision model, for the selected
// photo. models[0] (primary) is the one heroSelect actually uses; the rest
// are here purely to make the A/B contrast visible. Tap a card to vote.

function ModelComparison({ snapshots, photoId, getPreviewUrl, vote, onVote }) {
  const snap = snapshots.aestheticScore;
  const labels = snap?.modelLabels ?? [];

  if (!photoId) {
    return (
      <StatePanel state={{
        kind: 'empty',
        title: 'Select a photo to compare',
        body: 'Pick any photo in the grid below to see both models’ scores and reasoning side by side.',
      }} />
    );
  }

  const photo = snap?.perPhoto?.[photoId];
  const models = photo?.models ?? null;
  const name = snapshots.exif?.perPhoto?.[photoId]?.name ?? photoId;
  const thumb = snapshots.thumbnail?.perPhoto?.[photoId]?.thumbnailUrl ?? getPreviewUrl(photoId);

  let body;
  if (!photo) {
    body = (
      <StatePanel compact state={{
        kind: 'empty',
        title: 'Removed before scoring',
        body: 'This photo was dropped as a duplicate or burst frame, so it never reached the models.',
      }} />
    );
  } else if (!models || models.length === 0) {
    body = photo.error
      ? <StatePanel compact state={modelErrorCopy(labels.length > 1 ? 'Every model' : labels[0], photo.error)} />
      : (
        <StatePanel compact state={{
          kind: 'empty',
          title: 'Pre-filtered — not sent to a model',
          body: 'To bound cost, only the 3 sharpest photos per cluster (by a cheap Laplacian check) are sent to the vision models.',
        }} />
      );
  } else {
    body = (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {models.map((m, i) => (
          <ModelCard
            key={m.model ?? i}
            m={m}
            primary={i === 0}
            isVoted={vote != null && vote === m.model}
            onVote={() => onVote(photoId, m.model)}
          />
        ))}
      </div>
    );
  }

  return (
    <section aria-label="Model comparison" className="space-y-3">
      <div className="flex items-center gap-3 min-w-0">
        {thumb && <img src={thumb} alt="" className="w-11 h-11 rounded object-cover border border-faint shrink-0" />}
        <div className="min-w-0">
          <p className="text-[11px] text-muted uppercase tracking-[0.12em]">Comparing</p>
          <p className="text-sm font-mono text-ink truncate">{name}</p>
        </div>
      </div>
      {body}
    </section>
  );
}

function ModelCard({ m, primary, isVoted, onVote }) {
  const label = m.model ?? 'Unnamed model';
  const failed = m.score == null;

  if (failed) {
    const copy = modelErrorCopy(label, m.error ?? { kind: 'failed' });
    return (
      <div className="rounded-xl border border-faint bg-white px-4 py-3.5 flex flex-col gap-2.5">
        <ModelHeader label={label} primary={primary} />
        <StatePanel compact state={copy} />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onVote}
      aria-pressed={isVoted}
      className={`text-left rounded-xl border bg-white px-4 py-3.5 transition-all flex flex-col gap-2.5 ${
        isVoted ? 'border-ink ring-2 ring-ink ring-offset-1 ring-offset-cream' : 'border-ink/15 hover:border-ink/50'
      }`}
    >
      <ModelHeader label={label} primary={primary} voted={isVoted} />
      <div className="flex items-center gap-2.5 flex-wrap">
        <span
          className="text-lg font-mono font-medium px-2 py-0.5 rounded text-white tabular-nums"
          style={{ backgroundColor: scoreToColor(m.score) }}
        >
          {m.score.toFixed(2)}
        </span>
        {m.keep != null && (
          <span className={`text-xs font-medium uppercase tracking-[0.08em] px-2 py-0.5 rounded-full ${m.keep ? 'bg-green-100 text-green-800' : 'bg-ink/5 text-muted'}`}>
            {m.keep ? 'Keep' : 'Skip'}
          </span>
        )}
        {m.cached && (
          <span className="text-[10px] uppercase tracking-[0.1em] text-muted" title="Served from the score cache — no LLM call">
            cached
          </span>
        )}
      </div>
      <p className="text-[15px] leading-snug text-ink font-serif italic min-h-[1.4em]">
        {m.reason ? `“${m.reason}”` : <span className="not-italic font-sans text-sm text-muted">No reason given</span>}
      </p>
      <p className="text-[11px] text-muted">
        {isVoted ? 'Your pick · tap again to clear' : 'Tap if you agree with this model'}
      </p>
    </button>
  );
}

function ModelHeader({ label, primary, voted }) {
  return (
    <div className="flex items-center justify-between gap-2 min-w-0">
      <p className="text-sm font-medium text-ink truncate" title={label}>
        {label}
        {primary && (
          <span className="ml-2 text-[10px] uppercase tracking-[0.1em] text-muted font-normal" title="Drives hero selection in the pipeline">
            primary
          </span>
        )}
      </p>
      {voted && (
        <span className="text-[10px] uppercase tracking-[0.1em] font-medium text-cream bg-ink rounded-full px-2 py-0.5 shrink-0">
          ★ your pick
        </span>
      )}
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
        'Burst candidates are perceptually similar to a recent kept photo (block-mean hash, Hamming distance ≤ 10 of 64 bits). The number shown is that distance.',
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
      const n = snap.modelLabels?.length ?? 0;
      const prefiltered = Object.keys(snap.perPhoto ?? {}).length - (snap.candidateCount ?? 0);
      lines = [
        `${n > 1 ? `${n} vision models` : 'Vision model'} scored ${snap.scoredCount} photo${snap.scoredCount !== 1 ? 's' : ''}${prefiltered > 0 ? `; ${prefiltered} ${prefiltered === 1 ? 'was' : 'were'} pre-filtered out by a cheap Laplacian sharpness check` : ''}. Only the 3 sharpest photos per cluster are sent to a model.`,
        `Primary range ${snap.minScore?.toFixed(2) ?? '—'} – ${snap.maxScore?.toFixed(2) ?? '—'} · avg ${snap.avgScore?.toFixed(2) ?? '—'}. The primary model’s score drives hero selection.`,
      ];
      break;
    }
    case 'heroSelect':
      lines = [`${snap.heroCount} hero${snap.heroCount !== 1 ? 'es' : ''} selected using middle-photo heuristic. Stars mark heroes.`];
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
        <p key={i} className={`text-sm leading-relaxed ${i === 0 ? 'text-ink' : 'text-muted'}`}>{l}</p>
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
        <p className="text-[11px] text-muted uppercase tracking-[0.12em]">
          {allIds.length} photos · {STAGE_LABELS[stage] ?? stage}
          {selectedPhotoId && <span className="ml-2 normal-case tracking-normal hidden sm:inline">· click again to deselect</span>}
        </p>
        <button className="text-xs text-muted underline underline-offset-2" onClick={onToggleSort}>
          {sortByScore ? 'Original order' : 'Sort by score'}
        </button>
      </div>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))' }}>
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
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={isSelected}
      aria-label={exifData?.name ?? photoId}
      className={`relative block w-full p-0 rounded overflow-hidden border bg-white aspect-square transition-all cursor-pointer ${
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
    </button>
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
          aria-label="Close photo details"
          className="text-muted hover:text-ink ml-4 shrink-0 text-lg leading-none p-1 -m-1"
        >
          ✕
        </button>
      </div>
      <div className="flex flex-col sm:flex-row divide-y sm:divide-y-0 sm:divide-x divide-faint">
        {imgUrl && (
          <div className="shrink-0 w-full h-48 sm:w-36 sm:h-36">
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
        <div className="flex-1 px-4 py-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 content-start">
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
      if (!p) return { label: 'removed', color: '#9ca3af' };
      if (p.score == null) {
        if (p.error?.kind === 'rate_limit') return { label: '429 · retry', color: '#dc2626' };
        if (p.error) return { label: 'failed', color: '#dc2626' };
        if (p.models?.length) return { label: 'no data', color: '#9ca3af' };
        return { label: p.candidate ? 'no score' : 'filtered', color: '#9ca3af' };
      }
      const models = p.models ?? [];
      const missing = models.some((m) => m?.score == null);
      // Two models → show both scores so the grid itself reads as a comparison.
      const label = models.length > 1
        ? models.map((m) => (m?.score != null ? m.score.toFixed(2) : '—')).join(' · ')
        : p.score.toFixed(2);
      return {
        label: missing ? `${label} !` : label,
        color: scoreToColor(p.score),
        overlay: p.reason ? p.reason : null,
      };
    }

    default:
      return null;
  }
}
