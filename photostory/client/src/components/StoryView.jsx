import { useState, useRef, useEffect } from 'react';
import TimelineSidebar from './TimelineSidebar.jsx';
import Chapter from './Chapter.jsx';

export default function StoryView({ story, onBack }) {
  const [activeChapter, setActiveChapter] = useState(0);
  const containerRef = useRef(null);
  const chapterRefs = useRef([]);

  const chapters = story.chapters.filter((c) => c.photoCount > 0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const index = chapterRefs.current.indexOf(entry.target);
            if (index !== -1) {
              setActiveChapter(index);
            }
          }
        }
      },
      { root: container, threshold: 0.5 }
    );

    for (const ref of chapterRefs.current) {
      if (ref) observer.observe(ref);
    }

    return () => observer.disconnect();
  }, [chapters.length]);

  const scrollToChapter = (index) => {
    chapterRefs.current[index]?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleReorder = async (chapterId, newPhotoOrder) => {
    try {
      const res = await fetch(`/api/story/chapters/${chapterId}/reorder`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photos: newPhotoOrder }),
      });
      if (!res.ok) {
        console.error('Reorder failed');
        return false;
      }
      return true;
    } catch {
      console.error('Reorder error');
      return false;
    }
  };

  return (
    <div className="flex h-screen bg-gray-950">
      <TimelineSidebar
        chapters={chapters}
        activeIndex={activeChapter}
        onSelect={scrollToChapter}
        tripName={story.trip_name}
        onBack={onBack}
      />

      <div
        ref={containerRef}
        className="flex-1 overflow-y-scroll snap-y snap-mandatory snap-container"
      >
        {chapters.map((chapter, i) => (
          <div
            key={chapter.id}
            ref={(el) => (chapterRefs.current[i] = el)}
            className="snap-start min-h-screen"
          >
            <Chapter chapter={chapter} onReorder={handleReorder} />
          </div>
        ))}
      </div>
    </div>
  );
}
