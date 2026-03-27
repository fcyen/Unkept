import exifr from 'exifr';

/**
 * Extract EXIF data from a File object in the browser.
 * Returns { timestamp, latitude, longitude } or nulls.
 */
export async function extractExif(file) {
  try {
    const exif = await exifr.parse(file, {
      pick: ['DateTimeOriginal', 'CreateDate', 'ModifyDate'],
      gps: true,
    });
    if (!exif) return { timestamp: null, latitude: null, longitude: null };

    const dateVal = exif.DateTimeOriginal || exif.CreateDate || exif.ModifyDate;
    let timestamp = null;
    if (dateVal) {
      timestamp = dateVal instanceof Date ? dateVal.toISOString() : new Date(dateVal).toISOString();
    }

    const latitude = exif.latitude ?? null;
    const longitude = exif.longitude ?? null;

    return { timestamp, latitude, longitude };
  } catch {
    return { timestamp: null, latitude: null, longitude: null };
  }
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
