import { useState, useRef } from 'react';
import { extractBatch } from '../lib/exif.js';
import { generateThumbnails } from '../lib/thumbnails.js';
import { matchPhotosToEvents } from '../lib/matcher.js';
import { resolveLocations } from '../lib/geocode.js';

const SAMPLE_ITINERARY = {
  trip_name: 'Tokyo Trip 2025',
  events: [
    { id: 'evt_001', date: '2025-03-15', activity: 'Breakfast at Tsukiji Market', venue: 'Tsukiji Outer Market', start_time: '08:00', end_time: '09:30' },
    { id: 'evt_002', date: '2025-03-15', activity: 'Visit Senso-ji Temple', venue: 'Senso-ji, Asakusa', start_time: '10:00', end_time: '12:00' },
    { id: 'evt_003', date: '2025-03-15', activity: 'Lunch in Akihabara', venue: 'Akihabara Electric Town', start_time: '12:30', end_time: '14:00' },
    { id: 'evt_004', date: '2025-03-15', activity: 'Shopping in Harajuku', venue: 'Takeshita Street', start_time: '14:30', end_time: '16:30' },
    { id: 'evt_005', date: '2025-03-15', activity: 'Sunset at Shibuya Crossing', venue: 'Shibuya Scramble Square', start_time: '17:00', end_time: '18:30' },
    { id: 'evt_006', date: '2025-03-15', activity: 'Dinner in Shinjuku', venue: 'Omoide Yokocho', start_time: '19:00', end_time: '21:00' },
    { id: 'evt_007', date: '2025-03-16', activity: 'Morning at Meiji Shrine', venue: 'Meiji Jingu', start_time: '08:00', end_time: '10:00' },
    { id: 'evt_008', date: '2025-03-16', activity: 'Explore Teamlab Borderless', venue: 'Azabudai Hills', start_time: '10:30', end_time: '13:00' },
    { id: 'evt_009', date: '2025-03-16', activity: 'Afternoon in Odaiba', venue: 'Odaiba Seaside Park', start_time: '14:00', end_time: '17:00' },
    { id: 'evt_010', date: '2025-03-16', activity: 'Night Ramen Crawl', venue: 'Shinjuku Kabukicho', start_time: '19:00', end_time: '22:00' },
  ],
};

export default function UploadPage({ onStoryReady }) {
  const [photos, setPhotos] = useState([]);
  const [previews, setPreviews] = useState([]); // blob URLs for thumbnails
  const [itineraryText, setItineraryText] = useState('');
  const [itineraryMode, setItineraryMode] = useState('none');
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const addPhotos = (files) => {
    setPhotos((prev) => [...prev, ...files]);
    // Generate quick previews (small, fast)
    for (const file of files) {
      const url = URL.createObjectURL(file);
      setPreviews((prev) => [...prev, url]);
    }
  };

  const clearPhotos = () => {
    previews.forEach((url) => URL.revokeObjectURL(url));
    setPreviews([]);
    setPhotos([]);
  };

  const handlePhotoDrop = (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter((f) =>
      /\.(jpg|jpeg|png|heic|heif|webp|tiff)$/i.test(f.name)
    );
    addPhotos(files);
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    addPhotos(files);
  };

  const handleGenerate = async () => {
    if (photos.length === 0) {
      setError('Please add some photos first.');
      return;
    }

    setError('');
    setProcessing(true);

    try {
      let itinerary = null;
      if (itineraryMode === 'sample') {
        itinerary = SAMPLE_ITINERARY;
      } else if (itineraryMode === 'custom') {
        try {
          itinerary = JSON.parse(itineraryText);
        } catch {
          setError('Invalid JSON in itinerary field.');
          setProcessing(false);
          return;
        }
      }

      setProgress(`Reading EXIF data... 0/${photos.length}`);
      const photoData = await extractBatch(photos, (done, total) => {
        setProgress(`Reading EXIF data... ${done}/${total}`);
      });

      setProgress(`Generating thumbnails... 0/${photos.length}`);
      await generateThumbnails(photoData, (done, total) => {
        setProgress(`Generating thumbnails... ${done}/${total}`);
      });

      setProgress(itinerary ? 'Matching photos to events...' : 'Grouping photos by time...');
      const chapters = matchPhotosToEvents(photoData, itinerary);

      // Resolve GPS locations for each chapter
      setProgress('Resolving locations...');
      const { country } = await resolveLocations(chapters, (done, total) => {
        setProgress(`Resolving locations... ${done}/${total}`);
      });

      // Build trip name: "Country, Month Year" or use itinerary name
      let tripName;
      if (itinerary) {
        tripName = itinerary.trip_name;
      } else {
        tripName = buildTripName(country, photoData);
      }

      onStoryReady({
        trip_name: tripName,
        chapters,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setProcessing(false);
      setProgress('');
    }
  };

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center px-8 py-16">
      <div className="max-w-xl w-full">
        <div className="text-center mb-16">
          <h1 className="font-serif text-5xl md:text-6xl font-semibold text-ink mb-3">
            PhotoStory
          </h1>
          <div className="w-12 h-px bg-faint mx-auto mb-4" />
          <p className="font-sans text-muted text-sm tracking-wide">
            Turn your photos into a beautiful narrative
          </p>
        </div>

        {/* Photo Upload */}
        <div
          className="border border-faint/40 rounded-sm text-center cursor-pointer hover:border-ink/30 transition-colors mb-4 overflow-hidden"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handlePhotoDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            onChange={handleFileSelect}
          />

          {previews.length === 0 ? (
            <div className="p-12">
              <svg className="mx-auto h-10 w-10 mb-4 text-faint" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="font-serif text-lg text-ink">
                Drop photos here or click to browse
              </p>
              <p className="font-sans text-xs text-faint mt-2 tracking-wide">
                JPG, PNG, HEIC, WebP, TIFF
              </p>
            </div>
          ) : (
            <div className="p-4">
              <div className="grid grid-cols-6 sm:grid-cols-8 gap-1.5 mb-3">
                {previews.slice(0, 24).map((url, i) => (
                  <div key={i} className="aspect-square overflow-hidden bg-faint/10">
                    <img
                      src={url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
                {previews.length > 24 && (
                  <div className="aspect-square bg-faint/10 flex items-center justify-center">
                    <span className="font-sans text-xs text-muted">
                      +{previews.length - 24}
                    </span>
                  </div>
                )}
              </div>
              <p className="font-sans text-xs text-muted">
                {photos.length} photo{photos.length !== 1 ? 's' : ''} &middot; click to add more
              </p>
            </div>
          )}
        </div>

        {photos.length > 0 && (
          <button
            onClick={(e) => { e.stopPropagation(); clearPhotos(); }}
            className="font-sans text-xs text-muted hover:text-ink tracking-wide mb-8 block"
          >
            Clear all photos
          </button>
        )}

        {/* Itinerary */}
        <div className="mb-10">
          <p className="font-sans text-xs tracking-[0.2em] uppercase text-faint mb-4">
            Itinerary
          </p>
          <div className="flex gap-2 mb-4">
            {[
              { value: 'none', label: 'None' },
              { value: 'sample', label: 'Sample' },
              { value: 'custom', label: 'Custom' },
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => setItineraryMode(opt.value)}
                className={`px-4 py-2 text-xs font-sans tracking-wide transition-colors border ${
                  itineraryMode === opt.value
                    ? 'border-ink text-ink'
                    : 'border-faint/40 text-muted hover:border-ink/30 hover:text-ink'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {itineraryMode === 'none' && (
            <p className="font-sans text-xs text-faint leading-relaxed">
              Chapters will be auto-generated from photo timestamps &mdash; grouped by date and time gaps.
            </p>
          )}

          {itineraryMode === 'custom' && (
            <textarea
              value={itineraryText}
              onChange={(e) => setItineraryText(e.target.value)}
              placeholder="Paste your itinerary JSON here..."
              className="w-full h-40 bg-white border border-faint/40 p-4 font-mono text-xs text-ink focus:outline-none focus:border-ink resize-none"
            />
          )}

          {itineraryMode === 'sample' && (
            <div className="border border-faint/40 p-4 max-h-40 overflow-y-auto">
              <p className="font-serif text-sm text-ink mb-2">{SAMPLE_ITINERARY.trip_name}</p>
              {SAMPLE_ITINERARY.events.map((evt) => (
                <p key={evt.id} className="font-sans text-xs text-muted leading-relaxed">
                  {evt.date} {evt.start_time}&ndash;{evt.end_time} &middot; {evt.activity}
                </p>
              ))}
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="border border-red-300 bg-red-50 p-3 mb-6">
            <p className="font-sans text-xs text-red-600">{error}</p>
          </div>
        )}

        {/* Generate Button */}
        <button
          onClick={handleGenerate}
          disabled={processing}
          className="w-full py-4 border border-ink bg-ink text-cream font-sans text-sm tracking-widest uppercase hover:bg-ink/90 disabled:bg-faint disabled:border-faint disabled:text-cream/60 transition-colors"
        >
          {processing ? progress || 'Processing...' : 'Generate Story'}
        </button>
      </div>
    </div>
  );
}

function buildTripName(country, photoData) {
  // Get month/year from the earliest photo timestamp
  const timestamps = photoData
    .map((p) => p.timestamp)
    .filter(Boolean)
    .sort();

  if (timestamps.length === 0 && !country) return 'My Photo Story';

  let datePart = '';
  if (timestamps.length > 0) {
    const earliest = new Date(timestamps[0]);
    const latest = new Date(timestamps[timestamps.length - 1]);
    const monthFmt = (d) => d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    if (earliest.getMonth() === latest.getMonth() && earliest.getFullYear() === latest.getFullYear()) {
      datePart = monthFmt(earliest);
    } else {
      datePart = `${earliest.toLocaleDateString('en-US', { month: 'long' })} – ${monthFmt(latest)}`;
    }
  }

  if (country && datePart) return `${country}, ${datePart}`;
  if (country) return country;
  return datePart || 'My Photo Story';
}
