import { lazy, Suspense, useState } from 'react';
import UploadPage from './components/UploadPage.jsx';
import SlideshowPlayer from './components/slideshow/SlideshowPlayer.jsx';
import CompatibilityBlock from './components/CompatibilityBlock.jsx';
import { checkCompatibility } from './lib/compatibility.js';

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
    return <SlideshowPlayer story={story} onExit={() => setStory(null)} />;
  }

  return <UploadPage onStoryReady={setStory} />;
}
