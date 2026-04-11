import { useState } from 'react';
import UploadPage from './components/UploadPage.jsx';
import StoryView from './components/StoryView.jsx';

export default function App() {
  const [story, setStory] = useState(null);

  if (story) {
    return <StoryView story={story} onBack={() => setStory(null)} />;
  }

  return <UploadPage onStoryReady={setStory} />;
}
