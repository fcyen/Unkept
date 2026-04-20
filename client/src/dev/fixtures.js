/**
 * Fixture Story Skeletons for the /dev route.
 *
 * Three scenarios (short / long / edge) that stress-test different
 * aspects of the slideshow renderer without needing to run the pipeline:
 *
 *   short — 3 days, ~30 photos, landscape-heavy
 *   long  — 10 days, ~180 photos, mixed, tests geocoding + distance stat
 *   edge  — 1 day, ~10 photos, exercises every photo-card layout including
 *           the single-portrait fallback
 *
 * Each scenario is a valid Story Skeleton — passes `isValidSkeleton()`.
 * Thumbnails are inline SVG data URLs labelled with chapter·photo for
 * visual debugging; real image bytes are not required for layout work.
 *
 * Note on `orientation`: the production pipeline does not yet write this
 * field onto photos (the thumbnail stage knows dimensions and should set
 * it; follow-up work tracked in IMPLEMENTATION-PLAN.md PR 1C). For now,
 * fixtures include it so storyBuilder layout selection can exercise all
 * five photo-card layouts.
 */

const LANDSCAPE = { w: 60, h: 40, orientation: 'landscape' };
const PORTRAIT = { w: 40, h: 60, orientation: 'portrait' };

// Shorthand used in scenario specs.
const L = 'L';
const P = 'P';

function svgThumb({ w, h, label, hue, hero = false }) {
  const bg = `hsl(${hue}, ${hero ? 45 : 30}%, ${hero ? 60 : 75}%)`;
  const fg = `hsl(${hue}, 40%, 25%)`;
  const stroke = `hsl(${hue}, 40%, 50%)`;
  const fontSize = Math.round(Math.min(w, h) / 4);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<rect width="${w}" height="${h}" fill="${bg}" stroke="${stroke}" stroke-width="1"/>` +
    `<text x="${w / 2}" y="${h / 2 + fontSize / 3}" font-family="sans-serif" font-size="${fontSize}" fill="${fg}" text-anchor="middle">${label}</text>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

// Deterministic pseudo-random in [0, 1) — seeded by integer so fixtures are stable.
function seededRand(seed) {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

function buildSkeleton({ generatedAt, startDate, chapters }) {
  const photos = {};
  const chapterData = [];
  let photoIdx = 0;

  chapters.forEach((ch, chIdx) => {
    const chapterPhotoIds = [];
    const hue = Math.round((chIdx * 360) / Math.max(chapters.length, 1));
    const chDate = addDays(startDate, chIdx);

    ch.photos.forEach((orientCode, pIdx) => {
      const id = `photo_${photoIdx}`;
      const orient = orientCode === 'L' ? LANDSCAPE : PORTRAIT;
      // Spread timestamps across 8:00–18:00 within the day.
      const hour = 8 + Math.floor((pIdx * 10) / Math.max(ch.photos.length, 1));
      const minute = Math.floor((pIdx * 60) / Math.max(ch.photos.length, 1)) % 60;

      const isHero = pIdx === 0;
      // Hero gets a higher quality score so selection is deterministic.
      const qualityScore = isHero
        ? 0.85 + seededRand(photoIdx) * 0.1
        : 0.35 + seededRand(photoIdx + 1000) * 0.5;

      photos[id] = {
        id,
        name: `IMG_${String(1000 + photoIdx).padStart(4, '0')}.jpg`,
        timestamp: `${chDate}T${pad2(hour)}:${pad2(minute)}:00Z`,
        coords: ch.coords
          ? {
              lat: ch.coords.lat + (seededRand(photoIdx) - 0.5) * 0.005,
              lng: ch.coords.lng + (seededRand(photoIdx + 500) - 0.5) * 0.005,
            }
          : null,
        thumbnailUrl: svgThumb({
          w: orient.w,
          h: orient.h,
          label: `${chIdx + 1}\u00B7${pIdx + 1}`,
          hue,
        }),
        thumbnailHeroUrl: isHero
          ? svgThumb({
              w: orient.w * 2,
              h: orient.h * 2,
              label: `${chIdx + 1}\u2605`,
              hue,
              hero: true,
            })
          : null,
        thumbnailFailed: false,
        qualityScore,
        orientation: orient.orientation,
      };

      chapterPhotoIds.push(id);
      photoIdx++;
    });

    // Hero = highest-quality photo in the chapter (deterministic).
    const heroId = chapterPhotoIds.reduce((best, id) =>
      photos[id].qualityScore > photos[best].qualityScore ? id : best
    );

    chapterData.push({
      id: `chapter_${String(chIdx + 1).padStart(3, '0')}`,
      photoIds: chapterPhotoIds,
      heroPhotoId: heroId,
      date: chDate,
      coords: ch.coords || null,
    });
  });

  const totalPhotos = Object.keys(photos).length;
  return {
    version: '1.0',
    generatedAt,
    photos,
    chapters: chapterData,
    meta: {
      totalPhotosInput: Math.round(totalPhotos * 1.4),
      totalPhotosAfterDedup: totalPhotos,
      totalChapters: chapters.length,
      dateRange: {
        start: addDays(startDate, 0),
        end: addDays(startDate, chapters.length - 1),
      },
      surveyResponses: null,
    },
  };
}

// ---------------------------------------------------------------------------
// Scenario specs
// ---------------------------------------------------------------------------

// Helper for repeating orientation patterns.
const rep = (code, n) => Array(n).fill(code);

// SHORT — 3 days, ~30 photos (Tokyo, March 2025).
// Exercises: landscape-3 layout, mixed-2p-1l, photo-4 landscape.
const short = buildSkeleton({
  generatedAt: '2025-03-18T20:00:00Z',
  startDate: '2025-03-15',
  chapters: [
    // Day 1 — Asakusa: all landscape → landscape-3
    { coords: { lat: 35.714, lng: 139.797 }, photos: rep(L, 10) },
    // Day 2 — Shibuya: mixed → mixed-2p-1l (2P in top candidates + 1L)
    { coords: { lat: 35.661, lng: 139.704 }, photos: [P, P, L, P, L, P, L, P] },
    // Day 3 — Mt Fuji day trip: landscape-heavy → landscape-3
    { coords: { lat: 35.361, lng: 138.727 }, photos: rep(L, 12) },
  ],
});

// LONG — 10 days, ~180 photos (Indonesia, May 2025).
// Matches the storyboard example. Exercises: distance stat (Sumatra→Bali flight),
// long location names, many chapters, portrait-4 on a day of portraits.
const long = buildSkeleton({
  generatedAt: '2025-05-13T18:00:00Z',
  startDate: '2025-05-03',
  chapters: [
    // Day 1 — Medan arrival
    { coords: { lat: 3.595, lng: 98.672 }, photos: [L, L, P, L, L, L, P, L, L, L, L, L, P, L, L] },
    // Day 2 — Berastagi
    { coords: { lat: 3.192, lng: 98.511 }, photos: [L, L, L, P, L, L, L, L, P, L, L, L, L, L, L, L, L, L, L, L] },
    // Day 3 — Lake Toba (all portrait → portrait-4)
    { coords: { lat: 2.685, lng: 98.879 }, photos: rep(P, 25) },
    // Day 4 — Parapat
    { coords: { lat: 2.665, lng: 98.933 }, photos: [L, L, L, P, L, L, L, L, L, L, P, L, L, L, L, L, L, L] },
    // Day 5 — Samosir Island
    { coords: { lat: 2.597, lng: 98.770 }, photos: [L, P, L, L, P, L, L, P, L, L, L, P, L, L, L, L, L, L, L, L, L, L] },
    // Day 6 — Back to Medan
    { coords: { lat: 3.595, lng: 98.672 }, photos: [L, L, P, L, L, L, P, L, L, L, L, L] },
    // Day 7 — Flight to Bali (this is where the km stat shines)
    { coords: { lat: -8.749, lng: 115.167 }, photos: [L, L, L, L, L, L, L, L, P, L, L, P, L, L, L, L] },
    // Day 8 — Ubud
    { coords: { lat: -8.507, lng: 115.263 }, photos: [P, L, P, L, P, L, L, P, L, L, L, L, L, L, L, L, L, L, L, L] },
    // Day 9 — Uluwatu
    { coords: { lat: -8.829, lng: 115.085 }, photos: [L, L, L, L, L, L, L, L, L, L, L, P, L, L, L, L, L, L, L, L, L, L, L, L, L] },
    // Day 10 — Departure
    { coords: { lat: -8.749, lng: 115.167 }, photos: [L, P, L, L, P, L, L, L] },
  ],
});

// EDGE — 1 day, 4 short chapters covering every photo-card layout.
// Exercises: portrait-1 (single-photo), landscape-2, mixed-2p-1l, portrait-4.
// Counts below refer to non-hero photos, since the hero is shown on the
// chapter divider and is excluded from the photo card.
const edge = buildSkeleton({
  generatedAt: '2026-04-11T20:00:00Z',
  startDate: '2026-04-11',
  chapters: [
    // Chapter 1 — single photo → portrait-1 fallback (hero alone)
    { coords: { lat: 1.300, lng: 103.800 }, photos: [P] },
    // Chapter 2 — hero + 2 landscapes → landscape-2
    { coords: { lat: 1.310, lng: 103.810 }, photos: [L, L, L] },
    // Chapter 3 — hero + 2 portraits + 1 landscape → mixed-2p-1l
    { coords: { lat: 1.320, lng: 103.820 }, photos: [P, P, P, L] },
    // Chapter 4 — hero + 4 portraits → portrait-4
    { coords: { lat: 1.330, lng: 103.830 }, photos: [P, P, P, P, P] },
  ],
});

export const scenarios = {
  short: { key: 'short', label: 'Short trip (3 days)', skeleton: short },
  long: { key: 'long', label: 'Long trip (10 days, Indonesia)', skeleton: long },
  edge: { key: 'edge', label: 'Edge cases (every layout)', skeleton: edge },
};

export const scenarioList = [scenarios.short, scenarios.long, scenarios.edge];
