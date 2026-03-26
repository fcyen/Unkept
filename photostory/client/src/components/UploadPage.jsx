import { useState, useRef } from 'react';

const SAMPLE_ITINERARY = {
  trip_name: 'Tokyo Trip 2025',
  events: [
    {
      id: 'evt_001',
      date: '2025-03-15',
      activity: 'Breakfast at Tsukiji Market',
      venue: 'Tsukiji Outer Market',
      start_time: '08:00',
      end_time: '09:30',
    },
    {
      id: 'evt_002',
      date: '2025-03-15',
      activity: 'Visit Senso-ji Temple',
      venue: 'Senso-ji, Asakusa',
      start_time: '10:00',
      end_time: '12:00',
    },
    {
      id: 'evt_003',
      date: '2025-03-15',
      activity: 'Lunch in Akihabara',
      venue: 'Akihabara Electric Town',
      start_time: '12:30',
      end_time: '14:00',
    },
    {
      id: 'evt_004',
      date: '2025-03-15',
      activity: 'Shopping in Harajuku',
      venue: 'Takeshita Street',
      start_time: '14:30',
      end_time: '16:30',
    },
    {
      id: 'evt_005',
      date: '2025-03-15',
      activity: 'Sunset at Shibuya Crossing',
      venue: 'Shibuya Scramble Square',
      start_time: '17:00',
      end_time: '18:30',
    },
    {
      id: 'evt_006',
      date: '2025-03-15',
      activity: 'Dinner in Shinjuku',
      venue: 'Omoide Yokocho',
      start_time: '19:00',
      end_time: '21:00',
    },
    {
      id: 'evt_007',
      date: '2025-03-16',
      activity: 'Morning at Meiji Shrine',
      venue: 'Meiji Jingu',
      start_time: '08:00',
      end_time: '10:00',
    },
    {
      id: 'evt_008',
      date: '2025-03-16',
      activity: 'Explore Teamlab Borderless',
      venue: 'Azabudai Hills',
      start_time: '10:30',
      end_time: '13:00',
    },
    {
      id: 'evt_009',
      date: '2025-03-16',
      activity: 'Afternoon in Odaiba',
      venue: 'Odaiba Seaside Park',
      start_time: '14:00',
      end_time: '17:00',
    },
    {
      id: 'evt_010',
      date: '2025-03-16',
      activity: 'Night Ramen Crawl',
      venue: 'Shinjuku Kabukicho',
      start_time: '19:00',
      end_time: '22:00',
    },
  ],
};

export default function UploadPage({ onStoryReady }) {
  const [photos, setPhotos] = useState([]);
  const [itineraryText, setItineraryText] = useState('');
  const [useSample, setUseSample] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const handlePhotoDrop = (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter((f) =>
      /\.(jpg|jpeg|png|heic|heif|webp|tiff)$/i.test(f.name)
    );
    setPhotos((prev) => [...prev, ...files]);
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    setPhotos((prev) => [...prev, ...files]);
  };

  const handleGenerate = async () => {
    if (photos.length === 0) {
      setError('Please add some photos first.');
      return;
    }

    setError('');
    setUploading(true);

    try {
      // 1. Upload itinerary
      setProgress('Saving itinerary...');
      let itinerary;
      if (useSample) {
        itinerary = SAMPLE_ITINERARY;
      } else {
        try {
          itinerary = JSON.parse(itineraryText);
        } catch {
          setError('Invalid JSON in itinerary field.');
          setUploading(false);
          return;
        }
      }

      const itinRes = await fetch('/api/itinerary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(itinerary),
      });
      if (!itinRes.ok) {
        const data = await itinRes.json();
        throw new Error(data.error || 'Failed to save itinerary');
      }

      // 2. Upload photos in batches
      setProgress(`Uploading ${photos.length} photos...`);
      const formData = new FormData();
      for (const photo of photos) {
        formData.append('photos', photo);
      }

      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      if (!uploadRes.ok) {
        const data = await uploadRes.json();
        throw new Error(data.error || 'Failed to upload photos');
      }

      const uploadData = await uploadRes.json();
      setProgress(`Uploaded ${uploadData.count} photos. Generating story...`);

      // 3. Generate story
      const storyRes = await fetch('/api/story');
      if (!storyRes.ok) {
        const data = await storyRes.json();
        throw new Error(data.error || 'Failed to generate story');
      }

      const story = await storyRes.json();
      onStoryReady(story);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      setProgress('');
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-8">
      <div className="max-w-2xl w-full space-y-8">
        <div className="text-center">
          <h1 className="text-5xl font-bold text-white mb-2">PhotoStory</h1>
          <p className="text-gray-400 text-lg">
            Turn your photos into a beautiful narrative
          </p>
        </div>

        {/* Photo Upload */}
        <div
          className="border-2 border-dashed border-gray-600 rounded-xl p-8 text-center cursor-pointer hover:border-blue-500 transition-colors"
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
          <div className="text-gray-400">
            <svg className="mx-auto h-12 w-12 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-lg font-medium">
              {photos.length > 0
                ? `${photos.length} photo${photos.length !== 1 ? 's' : ''} selected`
                : 'Drop photos here or click to browse'}
            </p>
            <p className="text-sm text-gray-500 mt-1">JPG, PNG, HEIC, WebP, TIFF</p>
          </div>
        </div>

        {photos.length > 0 && (
          <button
            onClick={() => setPhotos([])}
            className="text-sm text-red-400 hover:text-red-300"
          >
            Clear all photos
          </button>
        )}

        {/* Itinerary */}
        <div className="space-y-3">
          <div className="flex items-center gap-4">
            <label className="text-gray-300 font-medium">Itinerary</label>
            <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
              <input
                type="checkbox"
                checked={useSample}
                onChange={(e) => setUseSample(e.target.checked)}
                className="rounded"
              />
              Use sample (Tokyo 2-day trip)
            </label>
          </div>

          {!useSample && (
            <textarea
              value={itineraryText}
              onChange={(e) => setItineraryText(e.target.value)}
              placeholder='Paste your itinerary JSON here...'
              className="w-full h-48 bg-gray-900 border border-gray-700 rounded-lg p-4 text-gray-300 font-mono text-sm focus:outline-none focus:border-blue-500 resize-none"
            />
          )}

          {useSample && (
            <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 max-h-48 overflow-y-auto">
              <p className="text-sm text-gray-400 mb-2 font-medium">{SAMPLE_ITINERARY.trip_name}</p>
              {SAMPLE_ITINERARY.events.map((evt) => (
                <p key={evt.id} className="text-xs text-gray-500">
                  {evt.date} {evt.start_time}–{evt.end_time} · {evt.activity}
                </p>
              ))}
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded-lg p-3 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Generate Button */}
        <button
          onClick={handleGenerate}
          disabled={uploading}
          className="w-full py-4 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold rounded-xl text-lg transition-colors"
        >
          {uploading ? progress || 'Processing...' : 'Generate Story'}
        </button>
      </div>
    </div>
  );
}
