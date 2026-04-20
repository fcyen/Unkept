/**
 * Quality Scoring Stage — Blur Detection
 *
 * Pipeline stage signature:
 *   ({ chapters, photos }: ThumbnailOutput, options, onProgress) => { chapters, photos }
 *
 * Normalises Laplacian variance to a 0–1 quality score. The variance is
 * pre-computed by the thumbnail stage (see `_rawVariance`) so the fast
 * path is just arithmetic and we avoid a second decode per photo.
 *
 * If `_rawVariance` is missing (e.g. in tests that stub the thumbnail
 * stage, or if thumbnail generation failed) we fall back to decoding the
 * 200px thumbnail data URL and running the Laplacian pass here.
 */

import { parallelMap, DEFAULT_STAGE_CONCURRENCY } from '../concurrency.js';

async function computeLaplacianVariance(dataUrl) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);

  const { width, height } = bitmap;
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const imageData = ctx.getImageData(0, 0, width, height);
  const pixels = imageData.data;

  const gray = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const offset = i * 4;
    gray[i] = 0.299 * pixels[offset] + 0.587 * pixels[offset + 1] + 0.114 * pixels[offset + 2];
  }

  let sum = 0;
  let sumSq = 0;
  let count = 0;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const laplacian =
        gray[idx - width] +
        gray[idx + width] +
        gray[idx - 1] +
        gray[idx + 1] -
        4 * gray[idx];

      sum += laplacian;
      sumSq += laplacian * laplacian;
      count++;
    }
  }

  if (count === 0) return 0;
  const mean = sum / count;
  return Math.max(0, sumSq / count - mean * mean);
}

/**
 * Sigmoid centered at 200 variance, steepness 0.01.
 * Typical sharp photos: variance > 500. Typical blurry photos: variance < 100.
 */
function normaliseScore(variance) {
  const score = 1 / (1 + Math.exp(-0.01 * (variance - 200)));
  return Math.round(score * 1000) / 1000;
}

/**
 * @param {{ chapters: Chapter[], photos: Map<string, PhotoData> }} input
 * @param {{ concurrency?: number }} options
 * @param {(done: number, total: number) => void} onProgress
 * @returns {Promise<{ chapters: Chapter[], photos: Map<string, PhotoData> }>}
 */
export async function qualityScoreStage(input, options = {}, onProgress) {
  const { chapters, photos } = input;
  const concurrency = options.concurrency ?? DEFAULT_STAGE_CONCURRENCY;

  const entries = [...photos.entries()];

  await parallelMap(
    entries,
    concurrency,
    async ([, photo]) => {
      // Fast path: thumbnail stage already computed raw variance on the
      // 200px canvas; we just normalise and drop the scratch field.
      if (photo._rawVariance != null) {
        photo.qualityScore = normaliseScore(photo._rawVariance);
        delete photo._rawVariance;
        return;
      }

      if (!photo.thumbnailUrl || photo.thumbnailFailed) {
        photo.qualityScore = null;
        return;
      }

      try {
        const variance = await computeLaplacianVariance(photo.thumbnailUrl);
        photo.qualityScore = normaliseScore(variance);
      } catch {
        photo.qualityScore = null;
      }
    },
    onProgress,
  );

  return { chapters, photos };
}

export { computeLaplacianVariance, normaliseScore };
