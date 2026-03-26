import PhotoGrid from './PhotoGrid.jsx';
import LazyImage from './LazyImage.jsx';

export default function Chapter({ chapter, onReorder }) {
  const { id, activity, venue, date, start_time, end_time, photos, heroPhoto } = chapter;

  const handleReorder = (newPhotos) => {
    onReorder(id, newPhotos);
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Hero Section */}
      {heroPhoto && (
        <div className="relative h-[50vh] overflow-hidden">
          <LazyImage
            src={heroPhoto.objectUrl}
            alt={activity}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-gray-950 via-gray-950/30 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-8">
            <div className="max-w-4xl">
              {date && (
                <p className="text-blue-400 text-sm font-medium mb-1">
                  {formatDate(date)} · {start_time} – {end_time}
                </p>
              )}
              <h2 className="text-4xl font-bold text-white mb-1">{activity}</h2>
              {venue && <p className="text-gray-300 text-lg">{venue}</p>}
            </div>
          </div>
        </div>
      )}

      {!heroPhoto && (
        <div className="p-8 pt-16">
          <div className="max-w-4xl">
            {date && (
              <p className="text-blue-400 text-sm font-medium mb-1">
                {formatDate(date)} · {start_time} – {end_time}
              </p>
            )}
            <h2 className="text-4xl font-bold text-white mb-1">{activity}</h2>
            {venue && <p className="text-gray-300 text-lg">{venue}</p>}
          </div>
        </div>
      )}

      {/* Photo Grid */}
      <div className="flex-1 p-8 pt-4">
        <PhotoGrid photos={photos} onReorder={handleReorder} />
      </div>
    </div>
  );
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}
