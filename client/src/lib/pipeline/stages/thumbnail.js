/**
 * Thumbnail Generation Stage
 *
 * Pipeline stage signature:
 *   ({ chapters, photos }: ChapterBuilderOutput, options, onProgress) => { chapters, photos }
 *
 * For each selected photo we decode once at HERO_SIZE and derive two tiers
 * from the same canvas:
 *   - thumbnailHeroUrl — ~1200px JPEG, used by the slideshow frames so
 *     full-bleed photos don't look upscaled.
 *   - thumbnailUrl     — ~200px JPEG, used by the upload preview grid and
 *     as the source for the Laplacian blur score.
 *
 * Laplacian variance is still computed from the 200px canvas (same
 * signal as before) so qualityScore stays on its fast path.
 *
 * Uses OffscreenCanvas on the main thread (worker version is a later
 * follow-up). HEIC: attempts createImageBitmap(); on failure marks
 * thumbnailFailed: true.
 */

import { parallelMap, DEFAULT_STAGE_CONCURRENCY } from '../concurrency.js';

const STANDARD_SIZE = 200;
const HERO_SIZE = 1200;
const STANDARD_JPEG_QUALITY = 0.7;
const HERO_JPEG_QUALITY = 0.82;

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
async function canvasToDataUrl(canvas, quality = STANDARD_JPEG_QUALITY) {
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `data:image/jpeg;base64,${btoa(binary)}`;
}

/**
 * Downscale an already-resized hero canvas to the standard tier.
 */
function downscaleCanvas(src, maxSize) {
  let width = src.width;
  let height = src.height;
  if (width > maxSize || height > maxSize) {
    if (width > height) {
      height = Math.round((height * maxSize) / width);
      width = maxSize;
    } else {
      width = Math.round((width * maxSize) / height);
      height = maxSize;
    }
  }
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(src, 0, 0, width, height);
  return { canvas, ctx, width, height };
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
      // One decode at hero size — the 200px tier is a cheap canvas
      // downscale from this so we don't pay for a second createImageBitmap.
      const hero = await decodeToCanvas(photo.file, HERO_SIZE);
      if (!hero) {
        photo.thumbnailFailed = true;
        photo.thumbnailUrl = null;
        photo.thumbnailHeroUrl = null;
        photo._rawVariance = null;
        return;
      }

      const std = downscaleCanvas(hero.canvas, STANDARD_SIZE);
      const stdImageData = std.ctx.getImageData(0, 0, std.width, std.height);
      photo._rawVariance = laplacianVariance(stdImageData);

      photo.thumbnailUrl = await canvasToDataUrl(std.canvas, STANDARD_JPEG_QUALITY);
      photo.thumbnailHeroUrl = await canvasToDataUrl(hero.canvas, HERO_JPEG_QUALITY);
    },
    onProgress,
  );

  return { chapters, photos };
}

export { generateDataUrl, isMobileDevice, laplacianVariance };
