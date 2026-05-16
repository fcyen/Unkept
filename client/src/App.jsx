import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import UploadPage from './components/UploadPage.jsx';
import SlideshowPlayer from './components/slideshow/SlideshowPlayer.jsx';
import CompatibilityBlock from './components/CompatibilityBlock.jsx';
import { checkCompatibility } from './lib/compatibility.js';
import { startStoryCaptions } from './lib/captions.js';

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
  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const [captions, setCaptions] = useState({});
  const captionsAbortRef = useRef(null);

  // Kick off captions the moment a story arrives. Generation runs in
  // parallel across chapters while the user is still on the cover frame —
  // by the time the slideshow reaches a chapter's photo card, that
  // chapter's caption is usually fully streamed.
  useEffect(() => {
    if (!story || !captionsEnabled) return undefined;
    const controller = new AbortController();
    captionsAbortRef.current = controller;
    startStoryCaptions(story, {
      onUpdate: setCaptions,
      signal: controller.signal,
    });
    return () => controller.abort();
  }, [story, captionsEnabled]);

  const handleStoryReady = (next, { captionsEnabled: enabled } = {}) => {
    setCaptions({});
    setCaptionsEnabled(Boolean(enabled));
    setStory(next);
  };

  const handleExit = () => {
    captionsAbortRef.current?.abort();
    captionsAbortRef.current = null;
    setStory(null);
    setCaptions({});
    setCaptionsEnabled(false);
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
    return (
      <SlideshowPlayer
        story={story}
        captions={captions}
        onExit={handleExit}
      />
    );
  }

  return <UploadPage onStoryReady={handleStoryReady} />;
}
