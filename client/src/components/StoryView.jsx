import { useState, useRef, useEffect } from 'react';
import Chapter from './Chapter.jsx';
import TableOfContents from './TableOfContents.jsx';

export default function StoryView({ story, onBack }) {
  const [activeChapter, setActiveChapter] = useState(0);
  const chapters = story.chapters.filter((c) => c.photoCount > 0);
  const chapterRefs = useRef([]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const index = chapterRefs.current.indexOf(entry.target);
            if (index !== -1) setActiveChapter(index);
          }
        }
      },
      { threshold: 0.3 }
    );

    for (const ref of chapterRefs.current) {
      if (ref) observer.observe(ref);
    }
    return () => observer.disconnect();
  }, [chapters.length]);

  const scrollToChapter = (index) => {
    chapterRefs.current[index]?.scrollIntoView({ behavior: 'smooth' });
  };

  // Group chapters by date for the cover
  const dates = [...new Set(chapters.map((c) => c.date).filter(Boolean))];
  const dateRange = dates.length > 0 ? formatDateRange(dates) : '';

  return (
    <div className="min-h-screen bg-cream">
      {/* Cover */}
      <header className="h-screen flex flex-col items-center justify-center px-8 relative">
        <button
          onClick={onBack}
          className="absolute top-8 left-8 text-muted hover:text-ink text-sm font-sans tracking-wide uppercase transition-colors"
        >
          &larr; Back
        </button>

        <div className="text-center max-w-3xl">
          {dateRange && (
            <p className="font-sans text-faint text-xs tracking-[0.3em] uppercase mb-6">
              {dateRange}
            </p>
          )}
          <h1 className="font-serif text-5xl md:text-7xl lg:text-8xl font-semibold text-ink leading-[1.1] mb-8">
            {story.trip_name}
          </h1>
          <div className="w-16 h-px bg-faint mx-auto mb-8" />
          <p className="font-sans text-muted text-sm tracking-wide">
            {chapters.reduce((sum, c) => sum + c.photoCount, 0)} photographs &middot; {chapters.length} chapters
          </p>
        </div>

        <div className="absolute bottom-12 animate-bounce">
          <svg className="w-5 h-5 text-faint" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </div>
      </header>

      {/* Table of Contents */}
      <TableOfContents
        chapters={chapters}
        activeIndex={activeChapter}
        onSelect={scrollToChapter}
      />

      {/* Chapters */}
      <main>
        {chapters.map((chapter, i) => (
          <div
            key={chapter.id}
            ref={(el) => (chapterRefs.current[i] = el)}
          >
            <Chapter chapter={chapter} chapterNumber={i + 1} />
          </div>
        ))}
      </main>

      {/* Footer */}
      <footer className="py-24 text-center">
        <div className="w-12 h-px bg-faint mx-auto mb-8" />
        <p className="font-serif text-2xl italic text-muted mb-4">fin.</p>
        <p className="font-sans text-xs text-faint tracking-widest uppercase">
          Made with Unkept
        </p>
      </footer>
    </div>
  );
}

function formatDateRange(dates) {
  const sorted = dates.sort();
  const first = new Date(sorted[0] + 'T00:00:00');
  const last = new Date(sorted[sorted.length - 1] + 'T00:00:00');
  const opts = { month: 'long', day: 'numeric', year: 'numeric' };

  if (sorted.length === 1) {
    return first.toLocaleDateString('en-US', opts);
  }
  if (first.getMonth() === last.getMonth() && first.getFullYear() === last.getFullYear()) {
    return `${first.toLocaleDateString('en-US', { month: 'long' })} ${first.getDate()}–${last.getDate()}, ${first.getFullYear()}`;
  }
  return `${first.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${last.toLocaleDateString('en-US', opts)}`;
}
