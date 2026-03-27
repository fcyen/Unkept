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

    cache.set(key, location || null);
    return location || null;
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
  console.log(`[PhotoStory] Location resolved: ${result}`);
  return result;
}

/**
 * Resolve locations for all chapters. Adds a `location` field to each chapter.
 * Throttles requests to respect Nominatim rate limits.
 */
export async function resolveLocations(chapters, onProgress) {
  for (let i = 0; i < chapters.length; i++) {
    chapters[i].location = await resolveChapterLocation(chapters[i].photos);
    if (onProgress) onProgress(i + 1, chapters.length);
    // Rate limit: 1 req/sec for Nominatim
    if (i < chapters.length - 1) {
      await new Promise((r) => setTimeout(r, 1100));
    }
  }
  return chapters;
}
