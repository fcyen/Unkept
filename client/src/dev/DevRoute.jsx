import { useMemo } from 'react';
import { scenarioList } from './fixtures.js';
import { buildStory } from '../lib/storyBuilder.js';
import { isValidSkeleton } from '../lib/validateSkeleton.js';

/**
 * Dev route — renders all three fixture scenarios side by side so the
 * slideshow renderer (PR 2B) can be iterated instantly without running
 * the pipeline or uploading files.
 *
 * Until the SlideshowPlayer lands, this shows a debug summary of each
 * scenario: skeleton validity, trip metadata, stat choice, and the
 * frame sequence with photo-card layouts resolved. Once PR 2B is in
 * place, replace `ScenarioPreview` with the real player.
 */
export default function DevRoute() {
  return (
    <div className="min-h-screen bg-cream text-ink p-6">
      <header className="max-w-6xl mx-auto mb-8">
        <h1 className="font-serif text-3xl">/dev — Phase 2 fixtures</h1>
        <p className="text-muted mt-2 text-sm">
          Three test scenarios for the Wrapped-style slideshow renderer. Edit{' '}
          <code className="font-mono">src/dev/fixtures.js</code> to adjust.
        </p>
      </header>

      <div className="max-w-6xl mx-auto grid gap-8 md:grid-cols-3">
        {scenarioList.map((sc) => (
          <ScenarioPreview key={sc.key} scenario={sc} />
        ))}
      </div>
    </div>
  );
}

function ScenarioPreview({ scenario }) {
  const { key, label, skeleton } = scenario;

  const validation = useMemo(() => isValidSkeleton(skeleton), [skeleton]);
  const story = useMemo(() => buildStory(skeleton), [skeleton]);

  return (
    <section className="border border-faint rounded-lg bg-white p-4">
      <header className="mb-3">
        <h2 className="font-serif text-xl">{label}</h2>
        <div className="text-xs text-muted mt-1 font-mono">{key}</div>
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
