import { lazy, Suspense, useState } from 'react';
import UploadPage from './components/UploadPage.jsx';
import SlideshowPlayer from './components/slideshow/SlideshowPlayer.jsx';
import CurationScreen from './components/curation/CurationScreen.jsx';
import CompatibilityBlock from './components/CompatibilityBlock.jsx';
import { checkCompatibility } from './lib/compatibility.js';
import { buildStory, applyGeocoding } from './lib/storyBuilder.js';

// Debug routes are lazy-imported and only resolved when MODE === 'debug'.
// Vite replaces import.meta.env.MODE with a literal string at build time,
// so Rollup tree-shakes the dynamic import() calls in non-debug builds —
// the dev route files are absent from the bundle entirely.
const DevRoute = import.meta.env.MODE === 'debug'
  ? lazy(() => import('./dev/DevRoute.jsx'))
  : null;
const PipelineDebugRoute = import.meta.env.MODE === 'debug'
  ? lazy(() => import('./dev/PipelineDebugRoute.jsx'))
  : null;

const isDebugMode = import.meta.env.MODE === 'debug';
const isDevRoute      = isDebugMode && window.location.pathname === '/dev';
const isPipelineRoute = isDebugMode && (
  window.location.pathname === '/pipeline' || window.location.pathname === '/'
);

// Run once at module load — gate the app before any pipeline code runs.
const compatibility = checkCompatibility();

// Re-derive a Story from the curated set: filter each chapter's photoIds
// down to what the user kept, replay buildStory + applyGeocoding so the
// slideshow renders only kept photos.
function curateStory(story, keptIds) {
  const keptSet = new Set(keptIds);
  const sk = story.skeleton;
  const filteredChapters = sk.chapters
    .map((ch) => {
      const photoIds = ch.photoIds.filter((id) => keptSet.has(id));
      const heroPhotoId = keptSet.has(ch.heroPhotoId) ? ch.heroPhotoId : photoIds[0];
      return { ...ch, photoIds, heroPhotoId };
    })
    .filter((ch) => ch.photoIds.length > 0);

  const filteredSkeleton = { ...sk, chapters: filteredChapters };
  let curated = buildStory(filteredSkeleton);

  // Reuse the geocoding already applied to the original story so we don't
  // need a second network round-trip just because the user pruned photos.
  const chapterLocations = {};
  let country = null;
  for (const ch of story.chapters) {
    if (ch.location) chapterLocations[ch.id] = ch.location;
    if (ch.location?.country) country = ch.location.country;
  }
  if (Object.keys(chapterLocations).length > 0) {
    curated = applyGeocoding(curated, { chapterLocations, country });
  }
  return curated;
}

export default function App() {
  const [story, setStory] = useState(null);
  const [curated, setCurated] = useState(null);
  // File handles for the kept set, retained across curation so the download
  // CTA can export full-res originals. Pruned to kept ids when curation
  // completes, and cleared when the session resets.
  const [originals, setOriginals] = useState(null);

  if (isPipelineRoute) {
    return <Suspense fallback={null}><PipelineDebugRoute /></Suspense>;
  }

  if (isDevRoute) {
    return <Suspense fallback={null}><DevRoute /></Suspense>;
  }

  if (!compatibility.passed) {
    return <CompatibilityBlock checks={compatibility.checks} />;
  }

  if (curated) {
    return (
      <SlideshowPlayer
        story={curated}
        onExit={() => { setCurated(null); setStory(null); setOriginals(null); }}
      />
    );
  }

  if (story) {
    return (
      <CurationScreen
        story={story}
        originals={originals}
        onBack={() => { setStory(null); setOriginals(null); }}
        onComplete={({ keptIds }) => {
          if (originals) {
            const keptSet = new Set(keptIds);
            const pruned = new Map();
            for (const id of keptIds) {
              const file = originals.get(id);
              if (file) pruned.set(id, file);
            }
            // Drop references to non-kept files so they can be GC'd.
            for (const id of originals.keys()) {
              if (!keptSet.has(id)) originals.delete(id);
            }
            setOriginals(pruned);
          }
          setCurated(curateStory(story, keptIds));
        }}
      />
    );
  }

  return (
    <UploadPage
      onStoryReady={(s, originalsMap) => {
        setStory(s);
        setOriginals(originalsMap || null);
      }}
    />
  );
}
