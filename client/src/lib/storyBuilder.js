/**
 * storyBuilder — Part 2 data layer.
 *
 * Takes a serialisable Story Skeleton (Part 1 output) and produces a
 * render-ready Story: a frame sequence for the Wrapped-style slideshow
 * (cover → chapter dividers → photo cards → coda), plus derived trip
 * metadata (trip name, distance/photo-count stat).
 *
 * Pure — no network, no DOM. Geocoding is applied separately in Part 2
 * and merged in via `applyGeocoding()`.
 *
 * See PHASE-2-DESIGN-INTENT.md for the storyboard and locked decisions.
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
 * One of five photo-card layouts — see PHASE-2-DESIGN-INTENT.md storyboard.
 * The hero is featured on the chapter divider that precedes the card, so
 * it is excluded here to avoid showing the same photo twice in a row.
 *
 * Rules (evaluated in order, all counts refer to non-hero photos):
 *   1. ≥4 portraits              → portrait-4
 *   2. ≥3 landscapes             → landscape-3
 *   3. ≥2 portraits + ≥1 landscape → mixed-2p-1l
 *   4. ≥2 landscapes             → landscape-2
 *   5. otherwise                 → portrait-1 (best non-hero, or hero alone
 *                                  if the chapter has no other photos)
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
  const landscapes = nonHero.filter((p) => p.orientation === 'landscape');
  const portraits = nonHero.filter((p) => p.orientation === 'portrait');

  // Sort by quality desc so "top N" is deterministic.
  const byQuality = (a, b) => (b.qualityScore ?? 0) - (a.qualityScore ?? 0);
  landscapes.sort(byQuality);
  portraits.sort(byQuality);

  // Rule 1 — portrait-4
  if (portraits.length >= 4) {
    return {
      layout: 'portrait-4',
      photoIds: portraits.slice(0, 4).map((p) => p.id),
    };
  }

  // Rule 2 — landscape-3
  if (landscapes.length >= 3) {
    return {
      layout: 'landscape-3',
      photoIds: landscapes.slice(0, 3).map((p) => p.id),
    };
  }

  // Rule 3 — mixed-2p-1l (2 portraits on top, 1 landscape below)
  if (portraits.length >= 2 && landscapes.length >= 1) {
    return {
      layout: 'mixed-2p-1l',
      photoIds: [portraits[0].id, portraits[1].id, landscapes[0].id],
    };
  }

  // Rule 4 — landscape-2
  if (landscapes.length >= 2) {
    return {
      layout: 'landscape-2',
      photoIds: [landscapes[0].id, landscapes[1].id],
    };
  }

  // Rule 5 — portrait-1 fallback. Prefer any non-hero photo so we still
  // avoid duplicating the hero; fall back to the hero only when it is the
  // chapter's only photo.
  const fallback = nonHero.length > 0
    ? [...nonHero].sort(byQuality)[0]
    : hero;
  return {
    layout: 'portrait-1',
    photoIds: [fallback.id],
  };
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
