import exifr from 'exifr';

/**
 * Extract EXIF DateTimeOriginal from a File object in the browser.
 * Returns an ISO string or null.
 */
export async function extractExifDate(file) {
  try {
    const exif = await exifr.parse(file, {
      pick: ['DateTimeOriginal', 'CreateDate', 'ModifyDate'],
    });
    if (!exif) return null;
    const date = exif.DateTimeOriginal || exif.CreateDate || exif.ModifyDate;
    if (!date) return null;
    return date instanceof Date ? date.toISOString() : new Date(date).toISOString();
  } catch {
    return null;
  }
}

/**
 * Extract EXIF dates for an array of File objects.
 * Returns array of { file, id, timestamp, objectUrl, thumbnailUrl }.
 */
export async function extractBatch(files, onProgress) {
  const results = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const timestamp = await extractExifDate(file);
    const objectUrl = URL.createObjectURL(file);

    results.push({
      id: `photo_${i}_${file.name}`,
      file,
      name: file.name,
      timestamp,
      objectUrl,
      thumbnailUrl: null, // generated separately
    });

    if (onProgress) {
      onProgress(i + 1, files.length);
    }
  }
  return results;
}
