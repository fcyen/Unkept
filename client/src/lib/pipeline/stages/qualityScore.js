/**
 * Quality Scoring Stage — Blur Detection
 *
 * Pipeline stage signature:
 *   ({ chapters, photos }: ThumbnailOutput, options, onProgress) => { chapters, photos }
 *
 * Computes a quality score (0–1) for each selected photo using Laplacian
 * variance on the 200px thumbnail. Higher variance = sharper image = higher score.
 *
 * The Laplacian kernel detects edges; blurry images have low edge response.
 * Score is normalised to 0–1 range using a sigmoid curve.
 */

/**
 * Compute Laplacian variance on a data URL image.
 * Returns a raw variance value (not normalised).
 */
async function computeLaplacianVariance(dataUrl) {
  // Decode the data URL to an ImageBitmap
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

  // Convert to grayscale
  const gray = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const offset = i * 4;
    gray[i] = 0.299 * pixels[offset] + 0.587 * pixels[offset + 1] + 0.114 * pixels[offset + 2];
  }

  // Apply 3x3 Laplacian kernel: [0, 1, 0; 1, -4, 1; 0, 1, 0]
  let sum = 0;
  let sumSq = 0;
  let count = 0;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const laplacian =
        gray[idx - width] +     // top
        gray[idx + width] +     // bottom
        gray[idx - 1] +         // left
        gray[idx + 1] -         // right
        4 * gray[idx];          // center

      sum += laplacian;
      sumSq += laplacian * laplacian;
      count++;
    }
  }

  if (count === 0) return 0;

  const mean = sum / count;
  const variance = (sumSq / count) - (mean * mean);

  return Math.max(0, variance);
}

/**
 * Normalise Laplacian variance to a 0–1 score using a sigmoid.
 * Typical sharp photos: variance > 500
 * Typical blurry photos: variance < 100
 */
function normaliseScore(variance) {
  // Sigmoid centered at 200, steepness 0.01
  const score = 1 / (1 + Math.exp(-0.01 * (variance - 200)));
  return Math.round(score * 1000) / 1000; // 3 decimal places
}

/**
 * @param {{ chapters: Chapter[], photos: Map<string, PhotoData> }} input
 * @param {object} options
 * @param {(done: number, total: number) => void} onProgress
 * @returns {Promise<{ chapters: Chapter[], photos: Map<string, PhotoData> }>}
 */
export async function qualityScoreStage(input, options = {}, onProgress) {
  const { chapters, photos } = input;
  const total = photos.size;
  let done = 0;

  for (const [id, photo] of photos) {
    if (photo.thumbnailUrl && !photo.thumbnailFailed) {
      try {
        const variance = await computeLaplacianVariance(photo.thumbnailUrl);
        photo.qualityScore = normaliseScore(variance);
      } catch {
        photo.qualityScore = null;
      }
    } else {
      photo.qualityScore = null;
    }

    done++;
    if (onProgress) onProgress(done, total);
  }

  return { chapters, photos };
}

export { computeLaplacianVariance, normaliseScore };
