/**
 * Web Worker for EXIF extraction.
 *
 * Receives File objects via postMessage, extracts timestamps using exifr,
 * and posts back metadata arrays in batches of ~50.
 *
 * GPS is intentionally NOT decoded here — that would be a second parse per
 * file. Chapter coordinates are instead extracted from the hero photo of
 * each chapter in `chapterBuilder`, so we only decode GPS once per chapter
 * rather than once per photo.
 *
 * Note: URL.createObjectURL() must be called on the main thread,
 * so this worker only returns raw metadata — the caller creates blob URLs.
 */
import exifr from 'exifr';

const BATCH_SIZE = 50;

async function extractTimestamp(file) {
  try {
    const exif = await exifr.parse(file, {
      pick: ['DateTimeOriginal', 'CreateDate', 'ModifyDate'],
    });
    if (exif) {
      const dateVal = exif.DateTimeOriginal || exif.CreateDate || exif.ModifyDate;
      if (dateVal) {
        return dateVal instanceof Date ? dateVal.toISOString() : new Date(dateVal).toISOString();
      }
    }
  } catch {
    // ignore — file may not have EXIF data
  }
  return null;
}

self.onmessage = async (e) => {
  const { files } = e.data;
  const total = files.length;
  let batch = [];

  for (let i = 0; i < total; i++) {
    const file = files[i];
    const timestamp = await extractTimestamp(file);

    batch.push({
      index: i,
      name: file.name,
      timestamp,
    });

    // Flush batch when full or on last item
    if (batch.length >= BATCH_SIZE || i === total - 1) {
      self.postMessage({ type: 'batch', batch, progress: i + 1, total });
      batch = [];
    }
  }

  self.postMessage({ type: 'done', total });
};
