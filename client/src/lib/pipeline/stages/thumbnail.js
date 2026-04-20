/**
 * Thumbnail Generation Stage
 *
 * Pipeline stage signature:
 *   ({ chapters, photos }: ChapterBuilderOutput, options, onProgress) => { chapters, photos }
 *
 * For each selected photo:
 * - Generates a 200px JPEG data URL (standard tier)
 * - Pre-computes Laplacian variance from the same canvas pass so
 *   qualityScore doesn't have to decode the thumbnail a second time.
 *
 * The 400px hero tier is currently disabled for MVP (it doubled the
 * decode cost for every chapter hero with limited visible payoff). The
 * plumbing stays so we can re-enable when the slideshow-native renderer
 * needs it.
 *
 * Uses OffscreenCanvas on the main thread (worker version is a later
 * follow-up). HEIC: attempts createImageBitmap(); on failure marks
 * thumbnailFailed: true.
 */

import { parallelMap, DEFAULT_STAGE_CONCURRENCY } from '../concurrency.js';

const STANDARD_SIZE = 200;
const JPEG_QUALITY = 0.7;

/**
 * Decode a file, resize into a canvas, return {canvas, ctx, width, height}.
 * Caller owns the canvas (no reuse). Returns null on decode failure (HEIC
 * on unsupported browsers, corrupt files).
 */
async function decodeToCanvas(file, maxSize) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null;
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

  return { canvas, ctx, width, height };
}

/**
 * Encode an OffscreenCanvas to a base64 data URL.
 */
async function canvasToDataUrl(canvas) {
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY });
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `data:image/jpeg;base64,${btoa(binary)}`;
}

/**
 * Compute Laplacian variance directly from ImageData. Shared pixel data
 * with the JPEG encode so we don't pay for a second decode downstream.
 */
function laplacianVariance(imageData) {
  const { width, height, data } = imageData;
  const gray = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    gray[i] = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
  }

  let sum = 0;
  let sumSq = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const v =
        gray[idx - width] +
        gray[idx + width] +
        gray[idx - 1] +
        gray[idx + 1] -
        4 * gray[idx];
      sum += v;
      sumSq += v * v;
      count++;
    }
  }
  if (count === 0) return 0;
  const mean = sum / count;
  return Math.max(0, sumSq / count - mean * mean);
}

/**
 * Legacy single-tier helper — kept exported so older callers/tests still
 * work. Returns a data URL or null on decode failure.
 */
async function generateDataUrl(file, maxSize) {
  const decoded = await decodeToCanvas(file, maxSize);
  if (!decoded) return null;
  return canvasToDataUrl(decoded.canvas);
}

function isMobileDevice() {
  if (typeof navigator === 'undefined') return false;
  if (navigator.userAgentData?.mobile) return true;
  if (typeof window !== 'undefined' && window.innerWidth < 768) return true;
  return false;
}

/**
 * @param {{ chapters: Chapter[], photos: Map<string, PhotoData> }} input
 * @param {{ concurrency?: number }} options
 * @param {(done: number, total: number) => void} onProgress
 * @returns {Promise<{ chapters: Chapter[], photos: Map<string, PhotoData> }>}
 */
export async function thumbnailStage(input, options = {}, onProgress) {
  const { chapters, photos } = input;
  const concurrency = options.concurrency ?? DEFAULT_STAGE_CONCURRENCY;

  const entries = [...photos.entries()];

  await parallelMap(
    entries,
    concurrency,
    async ([, photo]) => {
      const decoded = await decodeToCanvas(photo.file, STANDARD_SIZE);
      if (!decoded) {
        photo.thumbnailFailed = true;
        photo.thumbnailUrl = null;
        photo.thumbnailHeroUrl = null;
        photo._rawVariance = null;
        return;
      }

      // Pull imageData before the JPEG encode so the canvas's pixels are
      // still hot — this avoids a separate decode/getImageData pass in
      // qualityScore.
      const imageData = decoded.ctx.getImageData(0, 0, decoded.width, decoded.height);
      photo._rawVariance = laplacianVariance(imageData);
      photo.thumbnailUrl = await canvasToDataUrl(decoded.canvas);
      photo.thumbnailHeroUrl = null; // 400px tier disabled for MVP
    },
    onProgress,
  );

  return { chapters, photos };
}

export { generateDataUrl, isMobileDevice, laplacianVariance };
