/**
 * Reverse geocode coordinates to a city/area name using OpenStreetMap Nominatim.
 * Returns a location string like "Asakusa, Tokyo" or null.
 * Respects Nominatim's 1 req/sec rate limit.
 */

const cache = new Map();

async function reverseGeocode(lat, lon) {
  const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
  if (cache.has(key)) return cache.get(key);

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=14&accept-language=en`,
      { headers: { 'User-Agent': 'PhotoStory/1.0' } }
    );
    if (!res.ok) return null;

    const data = await res.json();
    const addr = data.address || {};

    // Build a readable location: neighbourhood/suburb, city
    const area = addr.neighbourhood || addr.suburb || addr.quarter || addr.town || '';
    const city = addr.city || addr.town || addr.village || addr.municipality || '';
    const country = addr.country || '';

    let location = '';
    if (area && city && area !== city) {
      location = `${area}, ${city}`;
    } else if (city) {
      location = city;
    } else if (country) {
      location = country;
    }

    const result = { location: location || null, country: country || null };
    cache.set(key, result);
    return result;
  } catch {
    return null;
  }
}

/**
 * Resolve location for a chapter based on its photos' GPS data.
 * Uses the median GPS coordinate from photos that have location data.
 */
export async function resolveChapterLocation(photos) {
  const withGps = photos.filter((p) => p.latitude != null && p.longitude != null);
  if (withGps.length === 0) {
    console.log('[PhotoStory] No GPS data in chapter photos');
    return null;
  }

  // Use median photo's coordinates (middle of the sorted set)
  const midIdx = Math.floor(withGps.length / 2);
  const median = withGps[midIdx];
  console.log(`[PhotoStory] Geocoding: ${median.latitude}, ${median.longitude}`);

  const result = await reverseGeocode(median.latitude, median.longitude);
  console.log(`[PhotoStory] Location resolved:`, result);
  return result;
}

/**
 * Resolve locations for all chapters. Adds a `location` field to each chapter.
 * Throttles requests to respect Nominatim rate limits.
 */
export async function resolveLocations(chapters, onProgress) {
  const countries = [];

  for (let i = 0; i < chapters.length; i++) {
    const result = await resolveChapterLocation(chapters[i].photos);
    chapters[i].location = result ? result.location : null;
    if (result?.country) countries.push(result.country);
    if (onProgress) onProgress(i + 1, chapters.length);
    // Rate limit: 1 req/sec for Nominatim
    if (i < chapters.length - 1) {
      await new Promise((r) => setTimeout(r, 1100));
    }
  }

  // Return the most common country across chapters
  const dominantCountry = getMostCommon(countries);
  return { chapters, country: dominantCountry };
}

function getMostCommon(arr) {
  if (arr.length === 0) return null;
  const counts = {};
  for (const val of arr) {
    counts[val] = (counts[val] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}
