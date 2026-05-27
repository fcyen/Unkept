import { useEffect, useRef, useState } from 'react';
import { usePipeline, PHASES } from '../lib/usePipeline.js';
import { buildStory, applyGeocoding } from '../lib/storyBuilder.js';
import { resolveSkeletonLocations } from '../lib/geocode.js';

// Each pipeline stage cycles through several phrasings while it runs, so
// the button feels alive instead of stuck on a single sentence.
const STAGE_PHRASES = {
  exif: [
    'Reading timestamps',
    'Extracting image data',
    'Sorting by capture time',
  ],
  dedup: [
    'Finding duplicates',
    'Filtering the photos',
    'Comparing fingerprints',
  ],
  cluster: [
    'Grouping by day',
    'Stitching moments together',
    'Sketching the chapters',
  ],
  heroSelect: [
    'Choosing highlights',
    'Spotting the best shots',
    'Picking hero moments',
  ],
  chapterBuilder: [
    'Building chapters',
    'Drafting the story',
    'Laying out the arc',
  ],
  thumbnail: [
    'Generating thumbnails',
    'Resizing for the page',
    'Preparing the artwork',
  ],
  qualityScore: [
    'Scoring quality',
    'Measuring sharpness',
    'Ranking the favourites',
  ],
};

const STARTING_PHRASES = ['Warming up', 'Getting started'];
const PHRASE_INTERVAL_MS = 1800;

export default function UploadPage({ onStoryReady }) {
  const [photos, setPhotos] = useState([]);
  const [previews, setPreviews] = useState([]); // blob URLs for preview grid
  const [error, setError] = useState('');
  const [geocodingProgress, setGeocodingProgress] = useState(null);
  // Covers the post-pipeline finalization (story build + geocoding) so the
  // CTA stays disabled all the way through to the curation screen, instead
  // of re-activating briefly between phase=DONE and the navigation.
  const [finalizing, setFinalizing] = useState(false);
  const fileInputRef = useRef(null);
  const handledResultRef = useRef(null);

  const pipeline = usePipeline();

  const processing =
    finalizing ||
    (pipeline.phase !== PHASES.IDLE &&
      pipeline.phase !== PHASES.DONE &&
      pipeline.phase !== PHASES.ERROR);

  // When the skeleton lands, build the Story, run geocoding, fold the
  // labels back in, and hand the result to SlideshowPlayer.
  useEffect(() => {
    if (!pipeline.result) return;
    if (handledResultRef.current === pipeline.result) return;
    handledResultRef.current = pipeline.result;

    (async () => {
      setFinalizing(true);
      try {
        const skeleton = pipeline.result;
        let story = buildStory(skeleton);

        setGeocodingProgress({ done: 0, total: skeleton.chapters.length });
        const { chapterLocations, country } = await resolveSkeletonLocations(
          skeleton,
          (done, total) => setGeocodingProgress({ done, total }),
        );
        setGeocodingProgress(null);

        story = applyGeocoding(story, { chapterLocations, country });

        previews.forEach((url) => URL.revokeObjectURL(url));
        setPreviews([]);
        setPhotos([]);

        onStoryReady(story);
      } catch (err) {
        setError(err.message || 'Failed to finish story.');
        setGeocodingProgress(null);
        setFinalizing(false);
      }
    })();
  }, [pipeline.result, previews, onStoryReady]);

  useEffect(() => {
    if (pipeline.error) setError(pipeline.error.message || 'Pipeline failed.');
  }, [pipeline.error]);

  const addPhotos = (files) => {
    if (files.length === 0) return;
    // Create all blob URLs up front, then commit in a single state update.
    // Previously we called setPreviews once per file; with a few hundred
    // files that's a few hundred re-renders and the main thread stays busy
    // long enough that clicking Generate feels unresponsive.
    const urls = files.map((file) => URL.createObjectURL(file));
    setPhotos((prev) => [...prev, ...files]);
    setPreviews((prev) => [...prev, ...urls]);
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
                    <img
                      src={url}
                      alt=""
                      loading="lazy"
                      decoding="async"
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

        <ProgressButton
          processing={processing}
          pipeline={pipeline}
          geocodingProgress={geocodingProgress}
          onClick={handleGenerate}
          hasPhotos={photos.length > 0}
        />
      </div>
    </div>
  );
}

/**
 * Generate / progress button. Cycles through stage-specific phrases on a
 * timer so the UI feels alive even when a stage holds the main thread for
 * a few seconds.
 */
function ProgressButton({ processing, pipeline, geocodingProgress, onClick, hasPhotos }) {
  const stage = geocodingProgress
    ? 'geocoding'
    : pipeline.progress?.stage || (processing ? 'starting' : null);

  const phrase = useCyclingPhrase(stage, processing && !geocodingProgress);

  let label;
  if (!processing) {
    label = 'Start curating';
  } else if (geocodingProgress) {
    const { done, total } = geocodingProgress;
    label = `Resolving locations… ${done}/${total}`;
  } else {
    const p = pipeline.progress;
    const counter = p && p.total > 0 ? ` ${p.progress}/${p.total}` : '';
    label = `${phrase}…${counter}`;
  }

  return (
    <button
      onClick={onClick}
      disabled={processing || !hasPhotos}
      className="w-full py-4 border border-ink bg-ink text-cream font-sans text-sm tracking-widest uppercase hover:bg-ink/90 disabled:bg-faint disabled:border-faint disabled:text-cream/60 transition-colors"
    >
      <span
        key={`${stage}-${phrase}`}
        className={processing ? 'inline-block animate-phrase-fade' : undefined}
      >
        {label}
      </span>
    </button>
  );
}

/**
 * Returns the current phrase for a stage, cycling through the stage's
 * phrase list every PHRASE_INTERVAL_MS while `active` is true. Resets
 * when `stage` changes.
 */
function useCyclingPhrase(stage, active) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
    if (!active || !stage) return undefined;
    const id = setInterval(() => setIndex((i) => i + 1), PHRASE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [stage, active]);

  if (!stage) return '';
  const list = STAGE_PHRASES[stage] || STARTING_PHRASES;
  return list[index % list.length];
}
