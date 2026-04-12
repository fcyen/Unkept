/**
 * Thumbnail Generation Stage
 *
 * Pipeline stage signature:
 *   ({ chapters, photos }: ChapterBuilderOutput, options, onProgress) => { chapters, photos }
 *
 * Generates thumbnail data URLs for selected photos only:
 * - 200px JPEG for all selected photos (standard tier)
 * - 400px JPEG for hero photos on desktop only (hero tier)
 *
 * Uses OffscreenCanvas in the main thread (worker version in Phase 1C+).
 * HEIC: attempts createImageBitmap(); on failure marks thumbnailFailed: true.
 *
 * Output: mutates PhotoData objects with thumbnailUrl (data URL) and
 * thumbnailHeroUrl (data URL, desktop only).
 */

const STANDARD_SIZE = 200;
const HERO_SIZE = 400;
const JPEG_QUALITY = 0.7;

/**
 * Detect if we're on a mobile device (no hero-tier thumbnails on mobile).
 */
function isMobileDevice() {
  if (typeof navigator === 'undefined') return false;
  if (navigator.userAgentData?.mobile) return true;
  if (typeof window !== 'undefined' && window.innerWidth < 768) return true;
  return false;
}

/**
 * Resize a File to a data URL at the given max dimension.
 * Returns null if the image can't be decoded.
 */
async function generateDataUrl(file, maxSize) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null; // HEIC or corrupt — can't decode
  }

  let { width, height } = bitmap;
  if (width > height) {
    if (width > maxSize) {
      height = Math.round((height * maxSize) / width);
      width = maxSize;
    }
  } else {
    if (height > maxSize) {
      width = Math.round((width * maxSize) / height);
      height = maxSize;
    }
  }

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY });

  // Convert blob to data URL
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `data:image/jpeg;base64,${btoa(binary)}`;
}

/**
 * @param {{ chapters: Chapter[], photos: Map<string, PhotoData> }} input
 * @param {{ skipHeroTier?: boolean }} options
 * @param {(done: number, total: number) => void} onProgress
 * @returns {Promise<{ chapters: Chapter[], photos: Map<string, PhotoData> }>}
 */
export async function thumbnailStage(input, options = {}, onProgress) {
  const { chapters, photos } = input;
  const mobile = isMobileDevice();
  const skipHeroTier = options.skipHeroTier ?? mobile;

  // Collect hero photo IDs
  const heroPhotoIds = new Set();
  for (const chapter of chapters) {
    if (chapter.heroPhotoId) heroPhotoIds.add(chapter.heroPhotoId);
  }

  const total = photos.size;
  let done = 0;

  for (const [id, photo] of photos) {
    // Generate standard 200px thumbnail
    const standardUrl = await generateDataUrl(photo.file, STANDARD_SIZE);

    if (standardUrl === null) {
      photo.thumbnailFailed = true;
      photo.thumbnailUrl = null;
    } else {
      photo.thumbnailUrl = standardUrl;
    }

    // Generate hero 400px thumbnail (desktop only, hero photos only)
    if (!skipHeroTier && heroPhotoIds.has(id) && !photo.thumbnailFailed) {
      photo.thumbnailHeroUrl = await generateDataUrl(photo.file, HERO_SIZE);
    } else {
      photo.thumbnailHeroUrl = null;
    }

    done++;
    if (onProgress) onProgress(done, total);
  }

  return { chapters, photos };
}

export { generateDataUrl, isMobileDevice };
