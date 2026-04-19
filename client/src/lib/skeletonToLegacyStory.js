/**
 * Adapter: Story Skeleton → legacy story shape consumed by StoryView/Chapter.
 *
 * The skeleton is the Phase 1 output (photos-by-id map, chapters with
 * photoIds). StoryView/Chapter/PhotoLayout currently speak the older
 * "embedded photo objects" shape. The real Phase 2 slideshow renderer
 * (PR 2B) will consume the skeleton directly, at which point this adapter
 * can be deleted.
 *
 * Keeping this thin on purpose — no network, no business logic. Just
 * reshapes data so the existing magazine renderer still works end-to-end
 * on top of the new pipeline.
 */

/**
 * @param {object} skeleton - validated Story Skeleton
 * @returns {{ chapters: object[] }} legacy story (caller adds trip_name)
 *
 * Note: `location`, `venue`, `start_time`, `end_time`, and `trip_name`
 * are *not* filled in here. The caller (UploadPage) resolves locations
 * via geocode.js and builds the trip name afterward.
 */
export function skeletonToLegacyStory(skeleton) {
  const chapters = skeleton.chapters.map((ch, idx) => {
    const photos = ch.photoIds
      .map((pid) => toLegacyPhoto(skeleton.photos[pid]))
      .filter(Boolean);

    const heroSource = skeleton.photos[ch.heroPhotoId];
    const heroPhoto = heroSource
      ? toLegacyPhoto(heroSource, { preferHero: true })
      : null;

    const { start, end } = timeRange(photos);

    return {
      id: ch.id,
      activity: `Day ${idx + 1}`,
      date: ch.date,
      start_time: start,
      end_time: end,
      coords: ch.coords ?? null,
      photos,
      heroPhoto,
      photoCount: photos.length,
      // Filled by geocoding in UploadPage:
      location: null,
      venue: null,
    };
  });

  return { chapters };
}

/**
 * Convert a skeleton photo into the shape PhotoLayout/Chapter expect:
 * `{ id, thumbnailUrl, objectUrl, latitude, longitude, timestamp }`.
 *
 * `objectUrl` is aliased to the data URL so PhotoLayout's fallback path
 * (`thumbnailUrl || objectUrl`) and Chapter's hero `<img>` both work
 * without branching on source type.
 */
function toLegacyPhoto(photo, opts = {}) {
  if (!photo) return null;
  const { preferHero = false } = opts;

  // Heroes prefer the 400px tier when available (desktop); everyone else
  // gets the 200px. Both are data URLs — no blob revocation concerns.
  const url = preferHero
    ? photo.thumbnailHeroUrl || photo.thumbnailUrl
    : photo.thumbnailUrl;

  return {
    id: photo.id,
    thumbnailUrl: url,
    objectUrl: url,
    timestamp: photo.timestamp,
    latitude: photo.coords ? photo.coords.lat : null,
    longitude: photo.coords ? photo.coords.lng : null,
  };
}

function timeRange(photos) {
  const stamps = photos
    .map((p) => p.timestamp)
    .filter(Boolean)
    .sort();
  if (stamps.length === 0) return { start: null, end: null };
  return {
    start: formatHHMM(stamps[0]),
    end: formatHHMM(stamps[stamps.length - 1]),
  };
}

function formatHHMM(iso) {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return null;
  return `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
}
