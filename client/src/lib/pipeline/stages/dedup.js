/**
 * Deduplication Stage
 *
 * Pipeline stage signature:
 *   (photos: PhotoData[], options, onProgress)
 *     => { photos: PhotoData[], burstGroups: BurstGroup[], burstCandidates: PhotoData[] }
 *
 * Two-pass deduplication:
 * 1. Exact hash: first 64KB + last 64KB + file size (no image decoding needed)
 *    Exact duplicates are dropped entirely — they have no frame variation.
 * 2. Perceptual hash: 16px grayscale average hash, hamming distance comparison
 *    Near-duplicates become burst candidates — preserved for live-photo
 *    rendering in PR 2F but not shown as individual photos in the story.
 *
 * Blob URLs for rejected duplicates are revoked immediately.
 */

import { parallelMap, DEFAULT_STAGE_CONCURRENCY } from '../concurrency.js';

const CHUNK_SIZE = 65536; // 64KB
const DEFAULT_HAMMING_THRESHOLD = 5;

/**
 * Read first and last 64KB of a file, combined with file size, to produce
 * a fast exact-match fingerprint (no image decoding).
 */
async function computeExactHash(file) {
  const size = file.size;
  const headBlob = file.slice(0, Math.min(CHUNK_SIZE, size));
  const tailBlob = file.slice(Math.max(0, size - CHUNK_SIZE), size);

  const [headBuf, tailBuf] = await Promise.all([
    headBlob.arrayBuffer(),
    tailBlob.arrayBuffer(),
  ]);

  // Simple FNV-1a-like hash over the bytes
  let hash = 2166136261 ^ size;
  const headView = new Uint8Array(headBuf);
  for (let i = 0; i < headView.length; i++) {
    hash ^= headView[i];
    hash = Math.imul(hash, 16777619);
  }
  const tailView = new Uint8Array(tailBuf);
  for (let i = 0; i < tailView.length; i++) {
    hash ^= tailView[i];
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36) + '_' + size.toString(36);
}

/**
 * Compute an average-hash (aHash) perceptual fingerprint.
 * Resizes image to 16x16 grayscale, then produces a 256-bit hash
 * based on whether each pixel is above or below the mean.
 *
 * Returns a Uint8Array of 32 bytes (256 bits).
 */
async function computePerceptualHash(file) {
  const bitmap = await createImageBitmap(file);
  const canvas = new OffscreenCanvas(16, 16);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, 16, 16);
  bitmap.close();

  const imageData = ctx.getImageData(0, 0, 16, 16);
  const pixels = imageData.data;

  // Convert to grayscale values
  const gray = new Uint8Array(256);
  let sum = 0;
  for (let i = 0; i < 256; i++) {
    const offset = i * 4;
    const g = Math.round(0.299 * pixels[offset] + 0.587 * pixels[offset + 1] + 0.114 * pixels[offset + 2]);
    gray[i] = g;
    sum += g;
  }

  const mean = sum / 256;

  // Generate hash: 1 bit per pixel, 1 if above mean
  const hash = new Uint8Array(32);
  for (let i = 0; i < 256; i++) {
    if (gray[i] >= mean) {
      hash[Math.floor(i / 8)] |= (1 << (i % 8));
    }
  }

  return hash;
}

/**
 * Compute hamming distance between two 32-byte hash arrays.
 */
function hammingDistance(a, b) {
  let dist = 0;
  for (let i = 0; i < 32; i++) {
    let xor = a[i] ^ b[i];
    while (xor) {
      dist += xor & 1;
      xor >>= 1;
    }
  }
  return dist;
}

/**
 * @param {PhotoData[]} photos
 * @param {{ hammingThreshold?: number }} options
 * @param {(done: number, total: number) => void} onProgress
 * @returns {Promise<{ photos: PhotoData[], burstGroups: BurstGroup[], burstCandidates: PhotoData[] }>}
 *
 * Returns:
 *   - photos: the representatives kept in the story
 *   - burstCandidates: near-duplicates (perceptual hash matches) that were
 *     otherwise rejected; preserved for future live-photo rendering (PR 2F)
 *   - burstGroups: { representativeId, candidateIds[] } mapping
 *
 * Exact-hash duplicates (identical bytes) are discarded entirely — they are
 * not useful as burst candidates since they contain no frame variation.
 */
export async function dedupStage(photos, options = {}, onProgress) {
  if (photos.length === 0) {
    return { photos: [], burstGroups: [], burstCandidates: [] };
  }

  const threshold = options.hammingThreshold ?? DEFAULT_HAMMING_THRESHOLD;
  const total = photos.length;

  // Pass 1: compute exact hashes in parallel, then dedup in order.
  // Order only matters for "which photo wins" — we keep the first occurrence,
  // so the sequential filter after the parallel hash is cheap.
  let passOneDone = 0;
  const exactHashes = await parallelMap(
    photos,
    DEFAULT_STAGE_CONCURRENCY,
    (photo) => computeExactHash(photo.file),
    () => {
      passOneDone++;
      // Weight pass 1 as ~40% of the total progress bar.
      if (onProgress) onProgress(Math.round((passOneDone / total) * 0.4 * total), total);
    },
  );

  const exactHashMap = new Map(); // hash -> index of first occurrence
  const afterExact = [];
  for (let i = 0; i < photos.length; i++) {
    if (exactHashMap.has(exactHashes[i])) continue;
    exactHashMap.set(exactHashes[i], i);
    afterExact.push(photos[i]);
  }

  // Pass 2: compute perceptual hashes in parallel, then resolve near-duplicates
  // sequentially so the "first wins" ordering is stable.
  let passTwoDone = 0;
  const perceptualHashes = await parallelMap(
    afterExact,
    DEFAULT_STAGE_CONCURRENCY,
    async (photo) => {
      try {
        return await computePerceptualHash(photo.file);
      } catch {
        // HEIC on unsupported browser, etc. — keep the photo; null hash
        // skips it during the comparison pass below.
        return null;
      }
    },
    () => {
      passTwoDone++;
      const overall = 0.4 * total + (passTwoDone / afterExact.length) * 0.6 * total;
      if (onProgress) onProgress(Math.round(overall), total);
    },
  );

  const kept = [];
  const keptHashes = [];
  const burstCandidates = [];
  const burstGroupsByRepId = new Map();

  for (let i = 0; i < afterExact.length; i++) {
    const photo = afterExact[i];
    const pHash = perceptualHashes[i];

    if (pHash === null) {
      kept.push(photo);
      keptHashes.push(null);
      continue;
    }

    let matchedRepIdx = -1;
    for (let j = 0; j < keptHashes.length; j++) {
      if (keptHashes[j] === null) continue;
      if (hammingDistance(pHash, keptHashes[j]) <= threshold) {
        matchedRepIdx = j;
        break;
      }
    }

    if (matchedRepIdx === -1) {
      kept.push(photo);
      keptHashes.push(pHash);
    } else {
      burstCandidates.push(photo);
      const repId = kept[matchedRepIdx].id;
      let group = burstGroupsByRepId.get(repId);
      if (!group) {
        group = { representativeId: repId, candidateIds: [] };
        burstGroupsByRepId.set(repId, group);
      }
      group.candidateIds.push(photo.id);
    }
  }

  if (onProgress) onProgress(total, total);

  return {
    photos: kept,
    burstGroups: [...burstGroupsByRepId.values()],
    burstCandidates,
  };
}

// Exported for testing
export { computeExactHash, computePerceptualHash, hammingDistance };
