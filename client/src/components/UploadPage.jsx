import { useEffect, useRef, useState } from 'react';
import { usePipeline, PHASES } from '../lib/usePipeline.js';
import { skeletonToLegacyStory } from '../lib/skeletonToLegacyStory.js';
import { resolveLocations } from '../lib/geocode.js';
import SurveyModal from './SurveyModal.jsx';

const PROGRESS_COPY = {
  exif: 'Reading timestamps',
  dedup: 'Finding duplicates',
  cluster: 'Grouping by day',
  heroSelect: 'Choosing highlights',
  chapterBuilder: 'Building chapters',
  thumbnail: 'Generating thumbnails',
  qualityScore: 'Scoring quality',
};

export default function UploadPage({ onStoryReady }) {
  const [photos, setPhotos] = useState([]);
  const [previews, setPreviews] = useState([]); // blob URLs for preview grid
  const [error, setError] = useState('');
  const [geocodingProgress, setGeocodingProgress] = useState(null);
  const fileInputRef = useRef(null);
  const handledResultRef = useRef(null);

  const pipeline = usePipeline();

  const processing =
    pipeline.phase !== PHASES.IDLE &&
    pipeline.phase !== PHASES.DONE &&
    pipeline.phase !== PHASES.ERROR;

  const surveyOpen = pipeline.phase !== PHASES.IDLE && pipeline.surveyDates.length > 0;

  // When the skeleton lands, run geocoding, then adapt to the legacy story
  // shape StoryView understands. This whole branch goes away once PR 2B
  // replaces StoryView with the skeleton-native slideshow.
  useEffect(() => {
    if (!pipeline.result) return;
    if (handledResultRef.current === pipeline.result) return;
    handledResultRef.current = pipeline.result;

    (async () => {
      try {
        const story = skeletonToLegacyStory(pipeline.result);

        setGeocodingProgress({ done: 0, total: story.chapters.length });
        const { country } = await resolveLocations(
          story.chapters,
          (done, total) => setGeocodingProgress({ done, total }),
        );
        setGeocodingProgress(null);

        previews.forEach((url) => URL.revokeObjectURL(url));
        setPreviews([]);
        setPhotos([]);

        onStoryReady({
          trip_name: buildTripName(country, pipeline.result),
          chapters: story.chapters,
        });
      } catch (err) {
        setError(err.message || 'Failed to finish story.');
        setGeocodingProgress(null);
      }
    })();
  }, [pipeline.result, previews, onStoryReady]);

  useEffect(() => {
    if (pipeline.error) setError(pipeline.error.message || 'Pipeline failed.');
  }, [pipeline.error]);

  const addPhotos = (files) => {
    setPhotos((prev) => [...prev, ...files]);
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
      /\.(jpg|jpeg|png|heic|heif|webp|tiff)$/i.test(f.name),
    );
    addPhotos(files);
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    addPhotos(files);
  };

  const handleGenerate = () => {
    if (photos.length === 0) {
      setError('Please add some photos first.');
      return;
    }
    setError('');
    pipeline.start(photos);
  };

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center px-8 py-16">
      <div className="max-w-xl w-full">
        <div className="text-center mb-16">
          <h1 className="font-serif text-5xl md:text-6xl font-semibold text-ink mb-3">
            Unkept
          </h1>
          <div className="w-12 h-px bg-faint mx-auto mb-4" />
          <p className="font-sans text-muted text-sm tracking-wide">
            Turn your photos into a beautiful narrative
          </p>
        </div>

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
                    <img src={url} alt="" className="w-full h-full object-cover" />
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

        {photos.length > 0 && !processing && (
          <button
            onClick={(e) => { e.stopPropagation(); clearPhotos(); }}
            className="font-sans text-xs text-muted hover:text-ink tracking-wide mb-8 block"
          >
            Clear all photos
          </button>
        )}

        {error && (
          <div className="border border-red-300 bg-red-50 p-3 mb-6">
            <p className="font-sans text-xs text-red-600">{error}</p>
          </div>
        )}

        <button
          onClick={handleGenerate}
          disabled={processing}
          className="w-full py-4 border border-ink bg-ink text-cream font-sans text-sm tracking-widest uppercase hover:bg-ink/90 disabled:bg-faint disabled:border-faint disabled:text-cream/60 transition-colors"
        >
          {processing ? renderProgress(pipeline, geocodingProgress) : 'Generate Story'}
        </button>
      </div>

      <SurveyModal
        open={surveyOpen}
        dates={pipeline.surveyDates}
        pipelineReady={pipeline.phase === PHASES.AWAITING_SURVEY}
        onSubmit={pipeline.submitSurvey}
        onSkip={pipeline.skipSurvey}
      />
    </div>
  );
}

function renderProgress(pipeline, geocodingProgress) {
  if (geocodingProgress) {
    const { done, total } = geocodingProgress;
    return `Resolving locations... ${done}/${total}`;
  }
  if (pipeline.phase === PHASES.AWAITING_SURVEY) {
    return 'Waiting for your answers...';
  }
  const p = pipeline.progress;
  if (!p) return 'Processing...';
  const copy = PROGRESS_COPY[p.stage] || p.stage;
  if (p.total > 0) return `${copy}... ${p.progress}/${p.total}`;
  return `${copy}...`;
}

function buildTripName(country, skeleton) {
  const dateRange = skeleton?.meta?.dateRange;
  if (!dateRange && !country) return 'My Photo Story';

  let datePart = '';
  if (dateRange) {
    const earliest = new Date(dateRange.start + 'T00:00:00');
    const latest = new Date(dateRange.end + 'T00:00:00');
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
