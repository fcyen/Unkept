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
 *    Pass 2 sorts by filename and only compares each photo against the last
 *    PERCEPTUAL_WINDOW kept reps — bursts are temporally local and cameras
 *    name files monotonically, so a global compare is unnecessary and would
 *    collapse unrelated repeat-subject shots.
 *
 * Blob URLs for rejected duplicates are revoked immediately.
 */

import { parallelMap, DEFAULT_STAGE_CONCURRENCY } from '../concurrency.js';

const CHUNK_SIZE = 65536; // 64KB
const DEFAULT_HAMMING_THRESHOLD = 5;
const PERCEPTUAL_WINDOW = 5;

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
 * Compute a difference-hash (dHash) perceptual fingerprint.
 * Resizes image to 17x16 grayscale, then for each row emits 16 bits where
 * bit i is 1 iff pixel[i] > pixel[i+1]. dHash captures horizontal gradients
 * and is more discriminative than aHash for "same scene, different subject"
 * cases, since two photos of the same room have similar overall brightness
 * (high aHash collision) but different edge structure.
 *
 * Returns a Uint8Array of 32 bytes (256 bits).
 */
async function computePerceptualHash(file, options = {}) {
  const bitmap = await createImageBitmap(file);
  const canvas = new OffscreenCanvas(17, 16);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, 17, 16);
  bitmap.close();

  const imageData = ctx.getImageData(0, 0, 17, 16);
  const pixels = imageData.data;

  // Convert to grayscale values (17 * 16 = 272 pixels)
  const gray = new Uint8Array(272);
  for (let i = 0; i < 272; i++) {
    const offset = i * 4;
    gray[i] = Math.round(0.299 * pixels[offset] + 0.587 * pixels[offset + 1] + 0.114 * pixels[offset + 2]);
  }

  // Generate hash: 16 bits per row, bit i is 1 iff pixel[i] > pixel[i+1].
  // 16 rows * 16 bits = 256 bits.
  const hash = new Uint8Array(32);
  for (let row = 0; row < 16; row++) {
    const rowStart = row * 17;
    for (let col = 0; col < 16; col++) {
      if (gray[rowStart + col] > gray[rowStart + col + 1]) {
        const bitIdx = row * 16 + col;
        hash[bitIdx >> 3] |= (1 << (bitIdx & 7));
      }
    }
  }

  if (!options.debug) return hash;

  // Debug path: paint grayscale pixels back onto the canvas and emit an
  // object URL so the dev route can show exactly what the hash "sees".
  for (let i = 0; i < 272; i++) {
    const offset = i * 4;
    pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = gray[i];
    pixels[offset + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
  const blob = await canvas.convertToBlob();
  const debugUrl = URL.createObjectURL(blob);
  return { hash, debugUrl };
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
  const rejectedExact = [];
  for (let i = 0; i < photos.length; i++) {
    if (exactHashMap.has(exactHashes[i])) {
      rejectedExact.push(photos[i]);
      continue;
    }
    exactHashMap.set(exactHashes[i], i);
    afterExact.push(photos[i]);
  }

  // Pass 2: compute perceptual hashes in parallel, then resolve near-duplicates
  // by walking photos in filename order. Camera filenames are monotonic, so
  // adjacency in filename order is a strong proxy for "taken close in time" —
  // and bursts are by definition temporally local.
  const filenameOrdered = afterExact
    .map((photo, originalIdx) => ({ photo, originalIdx }))
    .sort((a, b) =>
      a.photo.file.name.localeCompare(b.photo.file.name, undefined, { numeric: true }),
    );

  let passTwoDone = 0;
  const perceptualHashes = await parallelMap(
    filenameOrdered,
    DEFAULT_STAGE_CONCURRENCY,
    async ({ photo }) => {
      try {
        if (options.debug) {
          const { hash, debugUrl } = await computePerceptualHash(photo.file, { debug: true });
          photo._dHashThumbnailUrl = debugUrl;
          return hash;
        }
        return await computePerceptualHash(photo.file);
      } catch {
        // HEIC on unsupported browser, etc. — keep the photo; null hash
        // skips it during the comparison pass below.
        return null;
      }
    },
    () => {
      passTwoDone++;
      const overall = 0.4 * total + (passTwoDone / filenameOrdered.length) * 0.6 * total;
      if (onProgress) onProgress(Math.round(overall), total);
    },
  );

  const keptEntries = []; // { photo, originalIdx }
  const keptHashes = [];
  const burstCandidates = [];
  const burstGroupsByRepId = new Map();

  for (let i = 0; i < filenameOrdered.length; i++) {
    const { photo, originalIdx } = filenameOrdered[i];
    const pHash = perceptualHashes[i];

    if (pHash === null) {
      keptEntries.push({ photo, originalIdx });
      keptHashes.push(null);
      continue;
    }

    let matchedRepIdx = -1;
    let bestDist = Infinity;
    let bestIdx = -1;
    const windowStart = Math.max(0, keptHashes.length - PERCEPTUAL_WINDOW);
    for (let j = keptHashes.length - 1; j >= windowStart; j--) {
      if (keptHashes[j] === null) continue;
      const dist = hammingDistance(pHash, keptHashes[j]);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = j;
      }
    }
    if (bestIdx !== -1 && bestDist <= threshold) {
      matchedRepIdx = bestIdx;
    }

    if (matchedRepIdx === -1) {
      // Record nearest miss for debug visibility, even when no match.
      if (bestIdx !== -1) photo._nearestDistance = bestDist;
      keptEntries.push({ photo, originalIdx });
      keptHashes.push(pHash);
    } else {
      photo._hammingDistance = bestDist;
      photo._matchedRepId = keptEntries[matchedRepIdx].photo.id;
      burstCandidates.push(photo);
      const repId = keptEntries[matchedRepIdx].photo.id;
      let group = burstGroupsByRepId.get(repId);
      if (!group) {
        group = { representativeId: repId, candidateIds: [] };
        burstGroupsByRepId.set(repId, group);
      }
      group.candidateIds.push(photo.id);
    }
  }

  // Restore input order so downstream stages aren't surprised.
  keptEntries.sort((a, b) => a.originalIdx - b.originalIdx);
  const kept = keptEntries.map((e) => e.photo);

  if (onProgress) onProgress(total, total);

  return {
    photos: kept,
    burstGroups: [...burstGroupsByRepId.values()],
    burstCandidates,
    rejectedExact,
  };
}

// Exported for testing
export { computeExactHash, computePerceptualHash, hammingDistance };
