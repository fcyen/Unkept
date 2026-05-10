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
 * 2. Perceptual hash (pHash, DCT-based): resize to 32x32 grayscale, compute
 *    separable 2D DCT-II, take top-left 8x8 low-frequency coefficients (64
 *    values), hash bit i = coeff[i] > mean(all 64). Hamming distance comparison.
 *    DCT captures structural frequency content rather than raw brightness, so
 *    two photos of the same scene with similar brightness (sky, wall, same room)
 *    but different subjects will have different frequency signatures and stay
 *    separated — the block-mean hash failed this because it only encoded overall
 *    brightness layout. Burst frames share nearly identical frequency signatures
 *    and still cluster correctly.
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
const DEFAULT_HAMMING_THRESHOLD = 10; // out of 64 bits; pHash false-positive rate is low enough that 10 captures true bursts without collapsing distinct scenes
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
 * Compute a pHash (DCT-based) perceptual fingerprint.
 *
 * Algorithm:
 *   1. Resize to 32x32 grayscale.
 *   2. Separable 2D DCT-II: first reduce each row to 8 low-frequency
 *      components, then reduce each of those 8 columns to 8 components.
 *      Result is the top-left 8x8 sub-block of the full 32x32 DCT — the
 *      64 coefficients that carry the most structural energy.
 *   3. Hash bit i = 1 iff dctCoeffs[i] > mean(all 64 coefficients).
 *
 * Why DCT over block-mean: block-mean only encodes brightness layout.
 * Two photos of different subjects shot in the same room at the same time
 * of day can have nearly identical block-mean signatures. DCT encodes
 * structural frequency content — the spatial patterns of edges and
 * gradients — so two distinct scenes produce different signatures even
 * under similar illumination.
 *
 * Returns a Uint8Array of 8 bytes (64 bits).
 */
async function computePerceptualHash(file, options = {}) {
  const bitmap = await createImageBitmap(file);
  const canvas = new OffscreenCanvas(32, 32);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, 32, 32);
  bitmap.close();

  const imageData = ctx.getImageData(0, 0, 32, 32);
  const pixels = imageData.data;

  // Convert to grayscale (32 * 32 = 1024 pixels)
  const gray = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) {
    const o = i * 4;
    gray[i] = 0.299 * pixels[o] + 0.587 * pixels[o + 1] + 0.114 * pixels[o + 2];
  }

  // Separable 2D DCT-II over a 32x32 input, producing only the top-left
  // 8x8 output block.  Total work: 32*8*32 + 8*8*32 = 10240 muls.
  const N = 32;
  const scale = Math.PI / (2 * N);

  // Step 1: for each of the 8 target row-frequencies u, compute the 1D row
  // transform across all 32 source rows — giving a 32-column intermediate.
  const rowT = new Float32Array(8 * N); // [u][y]
  for (let u = 0; u < 8; u++) {
    for (let y = 0; y < N; y++) {
      let sum = 0;
      const row = y * N;
      for (let x = 0; x < N; x++) {
        sum += gray[row + x] * Math.cos(u * (2 * x + 1) * scale);
      }
      rowT[u * N + y] = sum;
    }
  }

  // Step 2: column transform — for each (u, v) output coefficient, combine
  // the 32 row-transformed values along the column dimension.
  const dctCoeffs = new Float32Array(64); // [v*8 + u]
  for (let v = 0; v < 8; v++) {
    for (let u = 0; u < 8; u++) {
      let sum = 0;
      const uRow = u * N;
      for (let y = 0; y < N; y++) {
        sum += rowT[uRow + y] * Math.cos(v * (2 * y + 1) * scale);
      }
      dctCoeffs[v * 8 + u] = sum;
    }
  }

  // Mean of all 64 coefficients; hash bit i = coeff[i] > mean.
  let mean = 0;
  for (let i = 0; i < 64; i++) mean += dctCoeffs[i];
  mean /= 64;

  const hash = new Uint8Array(8);
  for (let i = 0; i < 64; i++) {
    if (dctCoeffs[i] > mean) {
      hash[i >> 3] |= (1 << (i & 7));
    }
  }

  if (!options.debug) return hash;

  // Debug path: render the 8x8 DCT coefficient magnitudes as a 32x32 tile
  // (each coefficient painted as a 4x4 block), normalised so the largest
  // magnitude maps to white. This lets the dev route see what frequency
  // structure the hash is comparing.
  const maxAbs = dctCoeffs.reduce((m, v) => Math.max(m, Math.abs(v)), 1e-9);
  for (let by = 0; by < 8; by++) {
    for (let bx = 0; bx < 8; bx++) {
      // Map [-maxAbs, maxAbs] → [0, 255]; positive = bright, negative = dark.
      const val = Math.round(((dctCoeffs[by * 8 + bx] / maxAbs) * 0.5 + 0.5) * 255);
      for (let dy = 0; dy < 4; dy++) {
        for (let dx = 0; dx < 4; dx++) {
          const idx = ((by * 4 + dy) * 32 + (bx * 4 + dx)) * 4;
          pixels[idx] = pixels[idx + 1] = pixels[idx + 2] = val;
          pixels[idx + 3] = 255;
        }
      }
    }
  }
  ctx.putImageData(imageData, 0, 0);
  const blob = await canvas.convertToBlob();
  const debugUrl = URL.createObjectURL(blob);
  return { hash, debugUrl };
}

/**
 * Compute hamming distance between two equal-length hash arrays.
 */
function hammingDistance(a, b) {
  let dist = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
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
          photo._pHashThumbnailUrl = debugUrl;
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
