import PhotoLayout from './PhotoLayout.jsx';
import FadeIn from './FadeIn.jsx';

export default function Chapter({ chapter, chapterNumber }) {
  const { activity, venue, location, date, start_time, end_time, photos, heroPhoto } = chapter;

  return (
    <article className="py-16 md:py-24">
      {/* Chapter Header */}
      <FadeIn>
        <div className="max-w-3xl mx-auto px-8 mb-12 md:mb-16">
          <div className="flex items-baseline gap-4 mb-4">
            <span className="font-sans text-xs text-faint tracking-widest">
              {String(chapterNumber).padStart(2, '0')}
            </span>
            {date && (
              <span className="font-sans text-xs text-faint tracking-wide">
                {formatDate(date)}
                {start_time && end_time && ` \u00B7 ${start_time}\u2009\u2013\u2009${end_time}`}
              </span>
            )}
          </div>
          <h2 className="font-serif text-3xl md:text-5xl font-semibold text-ink leading-tight mb-3">
            {activity}
          </h2>
          {(venue || location) && (
            <p className="font-serif text-lg italic text-muted">
              {[venue, location].filter(Boolean).join(' \u2014 ')}
            </p>
          )}
        </div>
      </FadeIn>

      {/* Hero — Full-bleed */}
      {heroPhoto && (
        <FadeIn>
          <div className="mb-8 md:mb-12">
            <img
              src={heroPhoto.objectUrl}
              alt={activity}
              className="w-full max-h-[85vh] object-cover editorial-img"
            />
          </div>
        </FadeIn>
      )}

      {/* Photo Layout */}
      <PhotoLayout photos={photos} heroPhoto={heroPhoto} />
    </article>
  );
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
}
