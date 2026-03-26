/**
 * Match photos to itinerary events based on EXIF timestamps.
 * Fully client-side version.
 */

function parseEventDateTime(eventDate, timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const dt = new Date(`${eventDate}T00:00:00`);
  dt.setHours(hours, minutes, 0, 0);
  return dt;
}

export function matchPhotosToEvents(photos, itinerary) {
  const events = itinerary.events || [];

  const chapters = new Map();
  for (const event of events) {
    chapters.set(event.id, {
      event,
      photos: [],
    });
  }

  const unmatched = [];

  for (const photo of photos) {
    if (!photo.timestamp) {
      unmatched.push(photo);
      continue;
    }

    const photoTime = new Date(photo.timestamp);
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
      photos,
      heroPhoto: heroIndex >= 0 ? photos[heroIndex] : null,
      photoCount: photos.length,
    });
  }

  if (unmatched.length > 0) {
    const heroIndex = Math.floor(unmatched.length / 2);
    result.push({
      id: 'other_moments',
      activity: 'Other Moments',
      venue: '',
      date: null,
      start_time: null,
      end_time: null,
      photos: unmatched,
      heroPhoto: unmatched[heroIndex],
      photoCount: unmatched.length,
    });
  }

  return result;
}
