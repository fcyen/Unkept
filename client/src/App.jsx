import { useState } from 'react';
import UploadPage from './components/UploadPage.jsx';
import StoryView from './components/StoryView.jsx';
import CompatibilityBlock from './components/CompatibilityBlock.jsx';
import DevRoute from './dev/DevRoute.jsx';
import { checkCompatibility } from './lib/compatibility.js';

const isDevRoute =
  typeof window !== 'undefined' && window.location.pathname === '/dev';

// Run once at module load — gate the app before any pipeline code runs.
const compatibility = checkCompatibility();

export default function App() {
  const [story, setStory] = useState(null);

  // Simple pathname-based routing — Vite's dev server SPA fallback lets
  // `/dev` resolve to index.html. No router library needed.
  if (isDevRoute) {
    return <DevRoute />;
  }

  if (!compatibility.passed) {
    return <CompatibilityBlock checks={compatibility.checks} />;
  }

  if (story) {
    return <StoryView story={story} onBack={() => setStory(null)} />;
  }

  return <UploadPage onStoryReady={setStory} />;
}
