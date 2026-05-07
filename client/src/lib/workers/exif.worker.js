/**
 * Web Worker for EXIF extraction.
 *
 * Receives File objects via postMessage, extracts timestamp, GPS, and
 * camera/exposure metadata using exifr, and posts back results in batches
 * of ~50.
 *
 * Note: URL.createObjectURL() must be called on the main thread,
 * so this worker only returns raw metadata — the caller creates blob URLs.
 */
import exifr from 'exifr';

const BATCH_SIZE = 50;

async function extractExif(file) {
  let timestamp   = null;
  let latitude    = null;
  let longitude   = null;
  let make        = null;
  let model       = null;
  let lensModel   = null;
  let iso         = null;
  let fNumber     = null;
  let exposureTime = null;
  let width       = null;
  let height      = null;
  let orientation = null;

  try {
    const exif = await exifr.parse(file, {
      pick: [
        'DateTimeOriginal', 'CreateDate', 'ModifyDate',
        'Make', 'Model', 'LensModel',
        'ISO', 'FNumber', 'ExposureTime',
        'ImageWidth', 'ImageHeight', 'ExifImageWidth', 'ExifImageHeight',
        'PixelXDimension', 'PixelYDimension',
        'Orientation',
      ],
    });
    if (exif) {
      const dateVal = exif.DateTimeOriginal || exif.CreateDate || exif.ModifyDate;
      if (dateVal) {
        timestamp = dateVal instanceof Date ? dateVal.toISOString() : new Date(dateVal).toISOString();
      }
      make        = exif.Make        ?? null;
      model       = exif.Model       ?? null;
      lensModel   = exif.LensModel   ?? null;
      iso         = exif.ISO         ?? null;
      fNumber     = exif.FNumber     ?? null;
      exposureTime = exif.ExposureTime ?? null;
      orientation = exif.Orientation ?? null;
      width  = exif.ImageWidth  || exif.ExifImageWidth  || exif.PixelXDimension || null;
      height = exif.ImageHeight || exif.ExifImageHeight || exif.PixelYDimension || null;
    }
  } catch {
    // ignore — file may not have EXIF data
  }

  try {
    const gps = await exifr.gps(file);
    if (gps) {
      latitude  = gps.latitude  ?? null;
      longitude = gps.longitude ?? null;
    }
  } catch {
    // ignore — file may not have GPS data
  }

  return { timestamp, latitude, longitude, make, model, lensModel, iso, fNumber, exposureTime, width, height, orientation };
}

self.onmessage = async (e) => {
  const { files } = e.data;
  const total = files.length;
  let batch = [];

  for (let i = 0; i < total; i++) {
    const file  = files[i];
    const meta  = await extractExif(file);

    batch.push({
      index: i,
      name: file.name,
      size: file.size,
      ...meta,
    });

    if (batch.length >= BATCH_SIZE || i === total - 1) {
      self.postMessage({ type: 'batch', batch, progress: i + 1, total });
      batch = [];
    }
  }

  self.postMessage({ type: 'done', total });
};
