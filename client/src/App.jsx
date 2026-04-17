import { useState } from 'react';
import UploadPage from './components/UploadPage.jsx';
import StoryView from './components/StoryView.jsx';
import DevRoute from './dev/DevRoute.jsx';

const isDevRoute =
  typeof window !== 'undefined' && window.location.pathname === '/dev';

export default function App() {
  const [story, setStory] = useState(null);

  // Simple pathname-based routing — Vite's dev server SPA fallback lets
  // `/dev` resolve to index.html. No router library needed.
  if (isDevRoute) {
    return <DevRoute />;
  }

  if (story) {
    return <StoryView story={story} onBack={() => setStory(null)} />;
  }

  return <UploadPage onStoryReady={setStory} />;
}
