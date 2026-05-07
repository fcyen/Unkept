import { useState } from 'react';
import UploadPage from './components/UploadPage.jsx';
import SlideshowPlayer from './components/slideshow/SlideshowPlayer.jsx';
import CompatibilityBlock from './components/CompatibilityBlock.jsx';
import DevRoute from './dev/DevRoute.jsx';
import PipelineDebugRoute from './dev/PipelineDebugRoute.jsx';
import { checkCompatibility } from './lib/compatibility.js';

const isDevRoute =
  typeof window !== 'undefined' && window.location.pathname === '/dev';
const isPipelineRoute =
  typeof window !== 'undefined' && window.location.pathname === '/pipeline';

// Run once at module load — gate the app before any pipeline code runs.
const compatibility = checkCompatibility();

export default function App() {
  const [story, setStory] = useState(null);

  // Simple pathname-based routing — Vite's dev server SPA fallback lets
  // `/dev` resolve to index.html. No router library needed.
  if (isPipelineRoute) {
    return <PipelineDebugRoute />;
  }

  if (isDevRoute) {
    return <DevRoute />;
  }

  if (!compatibility.passed) {
    return <CompatibilityBlock checks={compatibility.checks} />;
  }

  if (story) {
    return <SlideshowPlayer story={story} onExit={() => setStory(null)} />;
  }

  return <UploadPage onStoryReady={setStory} />;
}
