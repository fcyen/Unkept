import { useMemo, useState } from 'react';
import { scenarioList } from './fixtures.js';
import { buildStory } from '../lib/storyBuilder.js';
import { isValidSkeleton } from '../lib/validateSkeleton.js';
import SlideshowPlayer from '../components/slideshow/SlideshowPlayer.jsx';

/**
 * Dev route — three fixture scenarios side by side.
 *
 * Each card shows a debug summary (validation, trip name, stat, frame
 * layout choices). Clicking "Play" opens the SlideshowPlayer full-screen
 * over everything so frame pacing, transitions, and gestures can be
 * iterated instantly — no pipeline run, no file upload.
 */
export default function DevRoute() {
  const [playingKey, setPlayingKey] = useState(null);

  const entries = useMemo(
    () =>
      scenarioList.map((sc) => ({
        ...sc,
        validation: isValidSkeleton(sc.skeleton),
        story: buildStory(sc.skeleton),
      })),
    []
  );

  const playing = playingKey ? entries.find((e) => e.key === playingKey) : null;

  return (
    <div className="min-h-screen bg-cream text-ink p-6">
      <header className="max-w-6xl mx-auto mb-8">
        <h1 className="font-serif text-3xl">/dev — Phase 2 fixtures</h1>
        <p className="text-muted mt-2 text-sm">
          Three test scenarios for the Wrapped-style slideshow. Click
          &ldquo;Play&rdquo; on any scenario to open the SlideshowPlayer. Edit{' '}
          <code className="font-mono">src/dev/fixtures.js</code> to tune the data.
        </p>
        <p className="text-muted mt-2 text-xs">
          Keyboard: <kbd className="font-mono">→</kbd>/<kbd className="font-mono">←</kbd>{' '}
          next/prev · <kbd className="font-mono">space</kbd> pause · <kbd className="font-mono">esc</kbd> close.
        </p>
      </header>

      <div className="max-w-6xl mx-auto grid gap-8 md:grid-cols-3">
        {entries.map((e) => (
          <ScenarioPreview
            key={e.key}
            entry={e}
            onPlay={() => setPlayingKey(e.key)}
          />
        ))}
      </div>

      {playing && (
        <SlideshowPlayer
          story={playing.story}
          onExit={() => setPlayingKey(null)}
        />
      )}
    </div>
  );
}

function ScenarioPreview({ entry, onPlay }) {
  const { key, label, skeleton, validation, story } = entry;

  return (
    <section className="border border-faint rounded-lg bg-white p-4">
      <header className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-serif text-xl">{label}</h2>
          <div className="text-xs text-muted mt-1 font-mono">{key}</div>
        </div>
        <button
          type="button"
          onClick={onPlay}
          disabled={!validation.valid}
          className="shrink-0 px-3 py-1.5 rounded-full bg-ink text-cream text-xs tracking-wide uppercase hover:bg-black disabled:opacity-30 disabled:cursor-not-allowed"
        >
          ▶ Play
        </button>
      </header>

      <dl className="text-sm space-y-1 mb-4">
        <Row label="Schema">
          {validation.valid ? (
            <span className="text-green-700">valid</span>
          ) : (
            <details>
              <summary className="text-red-700 cursor-pointer">
                invalid ({validation.errors.length})
              </summary>
              <ul className="mt-1 text-xs font-mono text-red-800">
                {validation.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </details>
          )}
        </Row>
        <Row label="Trip name">{story.tripName}</Row>
        <Row label="Date range">
          {story.dateRange.start} → {story.dateRange.end}
        </Row>
        <Row label="Stat">
          <span className="font-mono">{story.stat.value}</span>
          <span className="text-muted text-xs ml-2">({story.stat.kind})</span>
        </Row>
        <Row label="Photos / chapters">
          {Object.keys(skeleton.photos).length} / {skeleton.chapters.length}
        </Row>
        <Row label="Frames">{story.frames.length}</Row>
      </dl>

      <div className="mb-4">
        <h3 className="text-xs uppercase tracking-wide text-muted mb-2">
          Chapters &amp; photo-card layouts
        </h3>
        <ul className="space-y-2">
          {story.chapters.map((ch) => {
            const card = story.frames.find(
              (f) => f.type === 'photoCard' && f.chapterId === ch.id
            );
            const heroUrl = skeleton.photos[ch.heroPhotoId]?.thumbnailUrl;
            return (
              <li key={ch.id} className="flex gap-2 items-center text-xs">
                {heroUrl && (
                  <img
                    src={heroUrl}
                    alt=""
                    className="w-10 h-10 object-cover border border-faint rounded"
                  />
                )}
                <div className="flex-1">
                  <div>{ch.title}</div>
                  <div className="font-mono text-muted">
                    {card?.layout} · {card?.photoIds.length} photo
                    {card?.photoIds.length === 1 ? '' : 's'}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <details>
        <summary className="text-xs text-muted cursor-pointer">Frame sequence</summary>
        <ol className="mt-2 text-xs font-mono space-y-0.5">
          {story.frames.map((f, i) => (
            <li key={f.id} className="text-muted">
              <span className="inline-block w-6 text-right mr-2">{i}</span>
              {f.type}
              {f.layout ? ` · ${f.layout}` : ''}
              {f.chapterId ? ` · ${f.chapterId}` : ''}
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}

function Row({ label, children }) {
  return (
    <div className="flex gap-2">
      <dt className="text-muted w-28 shrink-0">{label}</dt>
      <dd className="flex-1">{children}</dd>
    </div>
  );
}
