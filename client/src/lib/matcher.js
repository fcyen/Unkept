/**
 * Match photos to itinerary events based on EXIF timestamps,
 * or auto-generate chapters from timestamps when no itinerary is provided.
 */

function parseEventDateTime(eventDate, timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const dt = new Date(`${eventDate}T00:00:00`);
  dt.setHours(hours, minutes, 0, 0);
  return dt;
}

function getTimeOfDay(hour) {
  if (hour < 6) return 'Early Morning';
  if (hour < 9) return 'Morning';
  if (hour < 12) return 'Late Morning';
  if (hour < 14) return 'Midday';
  if (hour < 17) return 'Afternoon';
  if (hour < 19) return 'Evening';
  if (hour < 22) return 'Night';
  return 'Late Night';
}

function formatTimeHHMM(date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function formatDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function buildChapter(id, activity, venue, date, startTime, endTime, photos) {
  const heroIndex = photos.length > 0 ? Math.floor(photos.length / 2) : -1;
  return {
    id,
    activity,
    venue: venue || '',
    date,
    start_time: startTime,
    end_time: endTime,
    photos,
    heroPhoto: heroIndex >= 0 ? photos[heroIndex] : null,
    photoCount: photos.length,
  };
}

/**
 * Auto-generate chapters from photo timestamps.
 * Groups photos by date, then splits into clusters when there's a 45+ minute gap.
 * Labels each cluster by time of day.
 */
const GAP_THRESHOLD_MS = 45 * 60 * 1000; // 45 minutes

export function groupPhotosByTimestamp(photos) {
  const withTime = photos.filter((p) => p.timestamp);
  const withoutTime = photos.filter((p) => !p.timestamp);

  // Sort by timestamp
  withTime.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  if (withTime.length === 0) {
    if (withoutTime.length === 0) return [];
    return [buildChapter('other_moments', 'All Photos', '', null, null, null, withoutTime)];
  }

  // Group by date
  const byDate = new Map();
  for (const photo of withTime) {
    const dt = new Date(photo.timestamp);
    const dateKey = formatDateStr(dt);
    if (!byDate.has(dateKey)) byDate.set(dateKey, []);
    byDate.get(dateKey).push(photo);
  }

  const chapters = [];
  let chapterIdx = 0;

  for (const [dateKey, datePhotos] of byDate) {
    // Split into clusters by time gaps
    const clusters = [];
    let current = [datePhotos[0]];

    for (let i = 1; i < datePhotos.length; i++) {
      const prev = new Date(datePhotos[i - 1].timestamp);
      const curr = new Date(datePhotos[i].timestamp);
      if (curr - prev > GAP_THRESHOLD_MS) {
        clusters.push(current);
        current = [];
      }
      current.push(datePhotos[i]);
    }
    clusters.push(current);

    // Track time-of-day usage per date so we can number duplicates
    const todCounts = new Map();

    for (const cluster of clusters) {
      chapterIdx++;
      const firstTime = new Date(cluster[0].timestamp);
      const lastTime = new Date(cluster[cluster.length - 1].timestamp);
      const tod = getTimeOfDay(firstTime.getHours());

      // Handle duplicate time-of-day labels within the same date
      const count = (todCounts.get(tod) || 0) + 1;
      todCounts.set(tod, count);
      const label = count > 1 ? `${tod} (${count})` : tod;

      chapters.push(
        buildChapter(
          `auto_${chapterIdx}`,
          label,
          '',
          dateKey,
          formatTimeHHMM(firstTime),
          formatTimeHHMM(lastTime),
          cluster
        )
      );
    }
  }

  // Add unmatched photos without timestamps
  if (withoutTime.length > 0) {
    chapters.push(buildChapter('other_moments', 'Other Moments', '', null, null, null, withoutTime));
  }

  return chapters;
}

/**
 * Match photos to itinerary events.
 */
export function matchPhotosToEvents(photos, itinerary) {
  // No itinerary — auto-generate from timestamps
  if (!itinerary) {
    return groupPhotosByTimestamp(photos);
  }

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
    result.push(
      buildChapter(event.id, event.activity, event.venue, event.date, event.start_time, event.end_time, photos)
    );
  }

  if (unmatched.length > 0) {
    result.push(buildChapter('other_moments', 'Other Moments', '', null, null, null, unmatched));
  }

  return result;
}
