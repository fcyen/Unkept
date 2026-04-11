/**
 * Match photos to itinerary events based on EXIF timestamps.
 *
 * Logic:
 * 1. For each photo with a timestamp, check if it falls within any event's [start_time, end_time] window
 * 2. No buffer — exact window matching only (0 min buffer)
 * 3. Unmatched photos (no EXIF or outside all windows) → "Other Moments" catch-all
 * 4. Hero photo = middle photo in each chapter's sorted array
 */

function parseEventDateTime(eventDate, timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const dt = new Date(`${eventDate}T00:00:00`);
  dt.setHours(hours, minutes, 0, 0);
  return dt;
}

function getPhotoLocalTime(photo) {
  if (!photo.timestamp) return null;
  return new Date(photo.timestamp);
}

export function matchPhotosToEvents(photos, itinerary) {
  const events = itinerary.events || [];

  // Build chapters map keyed by event id
  const chapters = new Map();
  for (const event of events) {
    chapters.set(event.id, {
      event,
      photos: [],
    });
  }

  const unmatched = [];

  for (const photo of photos) {
    const photoTime = getPhotoLocalTime(photo);
    if (!photoTime) {
      unmatched.push(photo);
      continue;
    }

    let matched = false;
    for (const event of events) {
      const start = parseEventDateTime(event.date, event.start_time);
      const end = parseEventDateTime(event.date, event.end_time);

      if (photoTime >= start && photoTime <= end) {
        chapters.get(event.id).photos.push(photo);
        matched = true;
        break;
      }
    }

    if (!matched) {
      unmatched.push(photo);
    }
  }

  // Sort photos within each chapter by timestamp
  for (const chapter of chapters.values()) {
    chapter.photos.sort((a, b) => {
      if (!a.timestamp || !b.timestamp) return 0;
      return new Date(a.timestamp) - new Date(b.timestamp);
    });
  }

  // Build result array
  const result = [];
  for (const event of events) {
    const chapter = chapters.get(event.id);
    const photos = chapter.photos;
    const heroIndex = photos.length > 0 ? Math.floor(photos.length / 2) : -1;

    result.push({
      id: event.id,
      activity: event.activity,
      venue: event.venue,
      date: event.date,
      start_time: event.start_time,
      end_time: event.end_time,
      photos: photos.map((p) => p.filename),
      heroPhoto: heroIndex >= 0 ? photos[heroIndex].filename : null,
      photoCount: photos.length,
    });
  }

  // Add "Other Moments" chapter if there are unmatched photos
  if (unmatched.length > 0) {
    const heroIndex = Math.floor(unmatched.length / 2);
    result.push({
      id: 'other_moments',
      activity: 'Other Moments',
      venue: '',
      date: null,
      start_time: null,
      end_time: null,
      photos: unmatched.map((p) => p.filename),
      heroPhoto: unmatched[heroIndex].filename,
      photoCount: unmatched.length,
    });
  }

  return result;
}
