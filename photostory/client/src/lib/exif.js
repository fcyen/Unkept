import exifr from 'exifr';

/**
 * Extract EXIF data from a File object in the browser.
 * Returns { timestamp, latitude, longitude } or nulls.
 */
export async function extractExif(file) {
  let timestamp = null;
  let latitude = null;
  let longitude = null;

  try {
    // Extract date tags
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
    // ignore
  }

  try {
    // Extract GPS separately — exifr.gps() handles the GPS IFD directly
    const gps = await exifr.gps(file);
    if (gps) {
      latitude = gps.latitude ?? null;
      longitude = gps.longitude ?? null;
    }
  } catch {
    // ignore
  }

  return { timestamp, latitude, longitude };
}

/**
 * Extract EXIF data for an array of File objects.
 */
export async function extractBatch(files, onProgress) {
  const results = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const { timestamp, latitude, longitude } = await extractExif(file);
    const objectUrl = URL.createObjectURL(file);

    results.push({
      id: `photo_${i}_${file.name}`,
      file,
      name: file.name,
      timestamp,
      latitude,
      longitude,
      objectUrl,
      thumbnailUrl: null,
    });

    if (onProgress) {
      onProgress(i + 1, files.length);
    }
  }
  return results;
}
