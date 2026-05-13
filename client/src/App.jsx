import { lazy, Suspense, useEffect, useState } from 'react';
import UploadPage from './components/UploadPage.jsx';
import SlideshowPlayer from './components/slideshow/SlideshowPlayer.jsx';
import CompatibilityBlock from './components/CompatibilityBlock.jsx';
import { checkCompatibility } from './lib/compatibility.js';
import { generateStoryCaptions } from './lib/captions.js';

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

export default function App() {
  const [story, setStory] = useState(null);
  const [captionsRequested, setCaptionsRequested] = useState(false);

  // Stream AI captions in once a story lands (only if the user opted in
  // on the upload screen). Each delta is appended to story.captions —
  // PhotoCardFrame renders it as a bottom overlay as it grows.
  useEffect(() => {
    if (!story || !captionsRequested) return undefined;
    if (story.captions && Object.keys(story.captions).length > 0) return undefined;

    const ac = new AbortController();
    generateStoryCaptions(story, {
      signal: ac.signal,
      onDelta: (chapterId, delta, info) => {
        setStory((prev) => {
          if (!prev) return prev;
          const captions = { ...(prev.captions || {}) };
          const entry = captions[chapterId] || { text: '', error: null, done: false };
          if (info?.error) {
            captions[chapterId] = { ...entry, error: info.error.message || 'failed' };
          } else if (delta) {
            captions[chapterId] = { ...entry, text: entry.text + delta };
          }
          return { ...prev, captions };
        });
      },
    }).catch(() => { /* per-chapter errors are already surfaced via onDelta */ });

    return () => ac.abort();
  }, [story, captionsRequested]);

  const handleStoryReady = (s, opts) => {
    setCaptionsRequested(Boolean(opts?.generateCaptions));
    setStory(s);
  };

  const handleExit = () => {
    setStory(null);
    setCaptionsRequested(false);
  };

  if (isPipelineRoute) {
    return <Suspense fallback={null}><PipelineDebugRoute /></Suspense>;
  }

  if (isDevRoute) {
    return <Suspense fallback={null}><DevRoute /></Suspense>;
  }

  if (!compatibility.passed) {
    return <CompatibilityBlock checks={compatibility.checks} />;
  }

  if (story) {
    return <SlideshowPlayer story={story} onExit={handleExit} />;
  }

  return <UploadPage onStoryReady={handleStoryReady} />;
}
