/**
 * Web Worker for EXIF extraction.
 *
 * Receives File objects via postMessage, extracts timestamp + GPS data
 * using exifr, and posts back metadata arrays in batches of ~50.
 *
 * Note: URL.createObjectURL() must be called on the main thread,
 * so this worker only returns raw metadata — the caller creates blob URLs.
 */
import exifr from 'exifr';

const BATCH_SIZE = 50;

async function extractExif(file) {
  let timestamp = null;
  let latitude = null;
  let longitude = null;

  try {
    const exif = await exifr.parse(file, {
      pick: ['DateTimeOriginal', 'CreateDate', 'ModifyDate'],
    });
    if (exif) {
      const dateVal = exif.DateTimeOriginal || exif.CreateDate || exif.ModifyDate;
      if (dateVal) {
        timestamp = dateVal instanceof Date ? dateVal.toISOString() : new Date(dateVal).toISOString();
      }
    }
  } catch {
    // ignore — file may not have EXIF data
  }

  try {
    const gps = await exifr.gps(file);
    if (gps) {
      latitude = gps.latitude ?? null;
      longitude = gps.longitude ?? null;
    }
  } catch {
    // ignore — file may not have GPS data
  }

  return { timestamp, latitude, longitude };
}

self.onmessage = async (e) => {
  const { files } = e.data;
  const total = files.length;
  let batch = [];

  for (let i = 0; i < total; i++) {
    const file = files[i];
    const metadata = await extractExif(file);

    batch.push({
      index: i,
      name: file.name,
      timestamp: metadata.timestamp,
      latitude: metadata.latitude,
      longitude: metadata.longitude,
    });

    // Flush batch when full or on last item
    if (batch.length >= BATCH_SIZE || i === total - 1) {
      self.postMessage({ type: 'batch', batch, progress: i + 1, total });
      batch = [];
    }
  }

  self.postMessage({ type: 'done', total });
};
