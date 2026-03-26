import exifr from 'exifr';
import fs from 'fs/promises';

/**
 * Extract DateTimeOriginal from a photo file.
 * Returns ISO date string or null if no EXIF date found.
 */
export async function extractExifDate(filePath) {
  try {
    const buffer = await fs.readFile(filePath);
    const exif = await exifr.parse(buffer, { pick: ['DateTimeOriginal', 'CreateDate', 'ModifyDate'] });
    if (!exif) return null;
    const date = exif.DateTimeOriginal || exif.CreateDate || exif.ModifyDate;
    if (!date) return null;
    return date instanceof Date ? date.toISOString() : new Date(date).toISOString();
  } catch {
    return null;
  }
}

/**
 * Extract EXIF dates for multiple files.
 * Returns array of { filename, filePath, timestamp } objects.
 */
export async function extractBatch(files) {
  const results = await Promise.all(
    files.map(async (file) => {
      const timestamp = await extractExifDate(file.path);
      return {
        filename: file.filename,
        originalName: file.originalname,
        filePath: file.path,
        timestamp,
      };
    })
  );
  return results;
}
