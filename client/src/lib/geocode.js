/**
 * Reverse-geocoding against OpenStreetMap Nominatim.
 *
 * Skeleton-native: consumes `skeleton.chapters` (each with a `coords`
 * property) and produces `{ chapterLocations, country }` shaped for
 * `storyBuilder.applyGeocoding`.
 *
 * Respects Nominatim's 1 req/sec rate limit via a per-call delay.
 * Caches by rounded coordinate key so repeat chapters in the same area
 * only cost one request.
 */

const cache = new Map();

async function reverseGeocode(lat, lon) {
  // ~100m resolution — matches how storyBuilder expects chapters near
  // each other to collapse onto the same label.
  const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  if (cache.has(key)) return cache.get(key);

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=14&accept-language=en`,
      { headers: { 'User-Agent': 'Unkept/1.0' } },
    );
    if (!res.ok) return null;

    const data = await res.json();
    const addr = data.address || {};
    const area = addr.neighbourhood || addr.suburb || addr.quarter || addr.town || '';
    const city = addr.city || addr.town || addr.village || addr.municipality || '';
    const country = addr.country || '';

    let label = '';
    if (area && city && area !== city) label = `${area}, ${city}`;
    else if (city) label = city;
    else if (country) label = country;

    const result = { label: label || null, country: country || null };
    cache.set(key, result);
    return result;
  } catch {
    return null;
  }
}

/**
 * Resolve a location label for every chapter with coordinates.
 *
 * @param {object} skeleton — a valid Story Skeleton
 * @param {(done: number, total: number) => void} [onProgress]
 * @returns {Promise<{
 *   chapterLocations: Record<string, { label: string|null, country: string|null }>,
 *   country: string | null,
 * }>}  shape is ready to pass into `applyGeocoding(story, result)`.
 */
export async function resolveSkeletonLocations(skeleton, onProgress) {
  const chapters = skeleton.chapters;
  const chapterLocations = {};
  const countries = [];

  for (let i = 0; i < chapters.length; i++) {
    const ch = chapters[i];
    if (ch.coords) {
      const result = await reverseGeocode(ch.coords.lat, ch.coords.lng);
      if (result) {
        chapterLocations[ch.id] = result;
        if (result.country) countries.push(result.country);
      }
    }

    if (onProgress) onProgress(i + 1, chapters.length);

    // Nominatim's rate limit is 1 req/sec; the cache short-circuits repeat
    // coords so in practice the wait only applies on fresh requests.
    if (i < chapters.length - 1) {
      await new Promise((r) => setTimeout(r, 1100));
    }
  }

  return { chapterLocations, country: mostCommon(countries) };
}

function mostCommon(arr) {
  if (arr.length === 0) return null;
  const counts = {};
  for (const val of arr) counts[val] = (counts[val] || 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}
