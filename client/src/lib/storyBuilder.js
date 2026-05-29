/**
 * storyBuilder — Part 3 (Assets/Story) data layer.
 *
 * Takes a serialisable Story Skeleton (Part 1 output, optionally filtered
 * by Part 2 curation) and produces a render-ready Story: a frame sequence
 * for the Wrapped-style slideshow (cover → chapter dividers → photo cards →
 * coda), plus derived trip metadata (trip name, distance/photo-count stat).
 *
 * Pure — no network, no DOM. Geocoding is applied separately in Part 3
 * and merged in via `applyGeocoding()`.
 *
 * See archived_docs/PHASE-2-DESIGN-INTENT.md for the storyboard and locked decisions.
 */

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * @param {object} skeleton - a valid Story Skeleton (Part 1 output)
 * @param {object} [opts]
 * @param {string|null} [opts.country] - optional country hint for trip name
 *        (normally supplied after geocoding)
 * @returns {object} Story
 */
export function buildStory(skeleton, opts = {}) {
  const { country = null } = opts;

  const totalPhotoCount = Object.keys(skeleton.photos).length;
  const distanceKm = computeChapterDistanceKm(skeleton.chapters);
  const stat = selectStat({ distanceKm, totalPhotoCount });

  const tripName = generateTripName({
    dateRange: skeleton.meta.dateRange,
    country,
  });

  const chapters = skeleton.chapters.map((ch, idx) => ({
    id: ch.id,
    date: ch.date,
    coords: ch.coords ?? null,
    heroPhotoId: ch.heroPhotoId,
    dayIndex: idx + 1,
    // Filled by applyGeocoding(); null until geocoding resolves.
    location: null,
    // "Day N" fallback title; geocoding upgrades to "Day N — <place>".
    title: `Day ${idx + 1}`,
  }));

  const frames = assembleFrames({ skeleton, chapters, tripName, stat });

  return {
    skeleton,
    tripName,
    dateRange: skeleton.meta.dateRange,
    stat,
    chapters,
    frames,
  };
}

/**
 * Merge geocoded labels into an already-built Story (immutable update).
 * Upgrades chapter titles from "Day N" to "Day N — <place>" and fills
 * `chapter.location`. Also updates the cover frame's tripName if a
 * country was previously unknown.
 */
export function applyGeocoding(story, { chapterLocations = {}, country = null } = {}) {
  const updatedChapters = story.chapters.map((ch) => {
    const loc = chapterLocations[ch.id];
    if (!loc) return ch;
    return {
      ...ch,
      location: loc,
      title: loc.label ? `Day ${ch.dayIndex} — ${loc.label}` : ch.title,
    };
  });

  const tripName = country
    ? generateTripName({ dateRange: story.dateRange, country })
    : story.tripName;

  // Rebuild frames using updated chapters so dividers reflect new titles.
  const frames = assembleFrames({
    skeleton: story.skeleton,
    chapters: updatedChapters,
    tripName,
    stat: story.stat,
  });

  return { ...story, tripName, chapters: updatedChapters, frames };
}

// ---------------------------------------------------------------------------
// Distance stat
// ---------------------------------------------------------------------------

/**
 * Sum of haversine distances between consecutive chapter centroids.
 * Chapters without coords are skipped (the transition they participate
 * in contributes 0 — there's no meaningful way to measure it).
 */
export function computeChapterDistanceKm(chapters) {
  let totalKm = 0;
  for (let i = 1; i < chapters.length; i++) {
    const a = chapters[i - 1].coords;
    const b = chapters[i].coords;
    if (!a || !b) continue;
    totalKm += haversineKm(a, b);
  }
  return Math.round(totalKm);
}

export function haversineKm(a, b) {
  const R = 6371; // Earth radius in km.
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const DISTANCE_THRESHOLD_KM = 50;

export function selectStat({ distanceKm, totalPhotoCount, threshold = DISTANCE_THRESHOLD_KM }) {
  if (distanceKm >= threshold) {
    return { kind: 'distance', raw: distanceKm, value: `${distanceKm.toLocaleString()}km travelled` };
  }
  return {
    kind: 'photo_count',
    raw: totalPhotoCount,
    value: `${totalPhotoCount.toLocaleString()} photo${totalPhotoCount === 1 ? '' : 's'} taken`,
  };
}

// ---------------------------------------------------------------------------
// Trip name
// ---------------------------------------------------------------------------

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * "Indonesia, May 2025" when country is known.
 * "May 2025" when country is not (pre-geocoding).
 * "May-June 2025" if the trip spans two months.
 */
export function generateTripName({ dateRange, country }) {
  if (!dateRange?.start || !dateRange?.end) {
    return country || 'Your Story';
  }

  const start = new Date(dateRange.start + 'T00:00:00Z');
  const end = new Date(dateRange.end + 'T00:00:00Z');
  const startMonth = MONTH_NAMES[start.getUTCMonth()];
  const endMonth = MONTH_NAMES[end.getUTCMonth()];
  const year = end.getUTCFullYear();

  const monthPart =
    startMonth === endMonth ? startMonth : `${startMonth}–${endMonth}`;
  const dateLabel = `${monthPart} ${year}`;

  return country ? `${country}, ${dateLabel}` : dateLabel;
}

// ---------------------------------------------------------------------------
// Photo card layout selection
// ---------------------------------------------------------------------------

/**
 * One of five photo-card layouts — see archived_docs/PHASE-2-DESIGN-INTENT.md storyboard.
 * Selection respects hero inclusion (hero is always in the output) and
 * prefers layouts that show more photos.
 *
 * Rules (evaluated in order):
 *   1. hero portrait  + ≥3 other portraits  → portrait-4
 *   2. hero landscape + ≥2 other landscapes → landscape-3
 *   3. ≥2 portraits + ≥1 landscape available (hero in one of them) → mixed-2p-1l
 *   4. hero landscape + ≥1 other landscape  → landscape-2
 *   5. otherwise                            → portrait-1 (hero alone, full frame)
 *
 * @param {{id, orientation, qualityScore, ...}[]} photos - full chapter photo
 *        list (hero included). Orientation required.
 * @param {string} heroId
 * @returns {{ layout: string, photoIds: string[] }}
 */
export function selectPhotoCardLayout(photos, heroId) {
  const byId = new Map(photos.map((p) => [p.id, p]));
  const hero = byId.get(heroId);
  if (!hero) {
    throw new Error(`selectPhotoCardLayout: heroId "${heroId}" not found in photos`);
  }

  const nonHero = photos.filter((p) => p.id !== heroId);
  const heroOrientation = orientationOf(hero);
  const landscapes = nonHero.filter((p) => orientationOf(p) === 'landscape');
  const portraits = nonHero.filter((p) => orientationOf(p) === 'portrait');

  // Sort by quality desc so "top N" is deterministic.
  const byQuality = (a, b) => (b.qualityScore ?? 0) - (a.qualityScore ?? 0);
  landscapes.sort(byQuality);
  portraits.sort(byQuality);

  // Rule 1 — portrait-4
  if (heroOrientation === 'portrait' && portraits.length >= 3) {
    return {
      layout: 'portrait-4',
      photoIds: [hero.id, ...portraits.slice(0, 3).map((p) => p.id)],
    };
  }

  // Rule 2 — landscape-3
  if (heroOrientation === 'landscape' && landscapes.length >= 2) {
    return {
      layout: 'landscape-3',
      photoIds: [hero.id, ...landscapes.slice(0, 2).map((p) => p.id)],
    };
  }

  // Rule 3 — mixed-2p-1l (2 portraits on top, 1 landscape below)
  //   Hero occupies its orientation slot; remaining slots filled by top quality.
  if (heroOrientation === 'portrait' && portraits.length >= 1 && landscapes.length >= 1) {
    return {
      layout: 'mixed-2p-1l',
      photoIds: [hero.id, portraits[0].id, landscapes[0].id],
    };
  }
  if (heroOrientation === 'landscape' && portraits.length >= 2) {
    return {
      layout: 'mixed-2p-1l',
      photoIds: [portraits[0].id, portraits[1].id, hero.id],
    };
  }

  // Rule 4 — landscape-2
  if (heroOrientation === 'landscape' && landscapes.length >= 1) {
    return {
      layout: 'landscape-2',
      photoIds: [hero.id, landscapes[0].id],
    };
  }

  // Rule 5 — portrait-1 fallback (single photo, full frame)
  return {
    layout: 'portrait-1',
    photoIds: [hero.id],
  };
}

function orientationOf(photo) {
  if (photo.orientation === 'portrait' || photo.orientation === 'landscape') {
    return photo.orientation;
  }
  if (typeof photo.width === 'number' && typeof photo.height === 'number') {
    return photo.height > photo.width ? 'portrait' : 'landscape';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Frame assembly
// ---------------------------------------------------------------------------

function assembleFrames({ skeleton, chapters, tripName, stat }) {
  const frames = [];

  frames.push({
    id: 'frame_cover',
    type: 'cover',
    tripName,
    dateRange: skeleton.meta.dateRange,
    stat,
  });

  chapters.forEach((ch, idx) => {
    const skelCh = skeleton.chapters[idx];
    const chapterPhotos = skelCh.photoIds.map((pid) => skeleton.photos[pid]);

    // Chapter divider: two photos flanking the text — pick top 2 by quality,
    // hero preferred on top.
    const sortedForDivider = [...chapterPhotos].sort(
      (a, b) => (b.qualityScore ?? 0) - (a.qualityScore ?? 0)
    );
    const topPhoto = sortedForDivider[0]?.id ?? null;
    const bottomPhoto = sortedForDivider[1]?.id ?? topPhoto;

    frames.push({
      id: `frame_divider_${ch.id}`,
      type: 'chapterDivider',
      chapterId: ch.id,
      dayIndex: ch.dayIndex,
      title: ch.title,
      location: ch.location,
      topPhotoId: topPhoto,
      bottomPhotoId: bottomPhoto,
    });

    const { layout, photoIds } = selectPhotoCardLayout(chapterPhotos, ch.heroPhotoId);
    frames.push({
      id: `frame_photocard_${ch.id}`,
      type: 'photoCard',
      chapterId: ch.id,
      layout,
      photoIds,
    });
  });

  frames.push({
    id: 'frame_coda',
    type: 'coda',
    text: 'The end.',
  });

  return frames;
}
