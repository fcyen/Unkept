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
 * 2. Perceptual hash (pHash, DCT-based): resize to 32×32 grayscale, compute
 *    the 2D DCT, take the top-left 8×8 = 64 frequency coefficients, compare
 *    each to the mean of the AC coefficients (skip DC at [0,0]). Bit i is 1
 *    iff coefficient[i] > acMean. DCT captures structural frequency layout —
 *    photos of the same scene differ only in high-frequency detail, so their
 *    top-left DCT coefficients are very close. Visually-different scenes
 *    diverge even when they share similar average brightness, which is what
 *    made the previous block-mean hash produce false positives (issue #16).
 *    Near-duplicates become burst candidates — preserved for live-photo
 *    rendering in PR 2F but not shown as individual photos in the story.
 *    Pass 2 sorts by filename and only compares each photo against the last
 *    PERCEPTUAL_WINDOW kept reps — bursts are temporally local and cameras
 *    name files monotonically, so a global compare is unnecessary and would
 *    collapse unrelated repeat-subject shots.
 *
 * Algorithm history:
 *   aHash / dHash (single-pixel comparison) → too sensitive; d=40-99 on real
 *     bursts because flat regions (sky, wall) flip bits under JPEG noise.
 *   64-bit block-mean hash → too coarse; photos with similar overall brightness
 *     layout collapsed even when subjects differed (false positives, issue #16).
 *   pHash (DCT) → captures structural frequency components; robust to noise
 *     and discriminative across different scenes.
 *
 * Blob URLs for rejected duplicates are revoked immediately.
 */

import { parallelMap, DEFAULT_STAGE_CONCURRENCY } from '../concurrency.js';

const CHUNK_SIZE = 65536; // 64KB
const DEFAULT_HAMMING_THRESHOLD = 10; // out of 64 bits
const PERCEPTUAL_WINDOW = 5;

// DCT parameters: 32×32 input, 8×8 top-left coefficients needed.
const DCT_N = 32;
const DCT_K = 8;

// Precompute cosine table at module load: cosTbl[k][n] = cos(π·k·(2n+1) / (2·N))
const _cosTbl = Array.from({ length: DCT_K }, (_, k) =>
  Float32Array.from({ length: DCT_N }, (_, n) =>
    Math.cos((Math.PI * k * (2 * n + 1)) / (2 * DCT_N)),
  ),
);

/**
 * Separable 2D unnormalized DCT-II, computing only the top-left DCT_K×DCT_K
 * coefficients of a DCT_N×DCT_N grayscale image. Normalization factors cancel
 * out because the hash compares coefficients to their own mean.
 * gray: Uint8Array of DCT_N*DCT_N values, row-major.
 * Returns Float32Array of DCT_K*DCT_K = 64 values.
 */
function _topLeftDCT(gray) {
  // 1D DCT along x for each row, keeping only DCT_K frequency bins.
  const mid = new Float32Array(DCT_K * DCT_N);
  for (let u = 0; u < DCT_K; u++) {
    const cu = _cosTbl[u];
    for (let y = 0; y < DCT_N; y++) {
      let s = 0;
      const row = y * DCT_N;
      for (let x = 0; x < DCT_N; x++) s += gray[row + x] * cu[x];
      mid[u * DCT_N + y] = s;
    }
  }
  // 1D DCT along y for each column of mid, keeping only DCT_K frequency bins.
  const out = new Float32Array(DCT_K * DCT_K);
  for (let v = 0; v < DCT_K; v++) {
    const cv = _cosTbl[v];
    for (let u = 0; u < DCT_K; u++) {
      let s = 0;
      for (let y = 0; y < DCT_N; y++) s += mid[u * DCT_N + y] * cv[y];
      out[v * DCT_K + u] = s;
    }
  }
  return out;
}

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
 * Resizes image to 32×32 grayscale, computes the 2D DCT, takes the top-left
 * 8×8 = 64 frequency coefficients, then sets hash bit i = 1 iff coefficient[i]
 * exceeds the mean of the 63 AC coefficients (skipping DC at index 0, which
 * encodes average brightness and would bias the mean).
 *
 * The DCT captures structural frequency layout. Burst photos — same scene,
 * minor subject/camera movement — share nearly identical low-frequency
 * components and produce low Hamming distance. Photos of different scenes
 * diverge even when their overall brightness is similar, which is the failure
 * mode block-mean hash had (issue #16).
 *
 * Returns a Uint8Array of 8 bytes (64 bits).
 */
async function computePerceptualHash(file, options = {}) {
  const bitmap = await createImageBitmap(file);
  const canvas = new OffscreenCanvas(DCT_N, DCT_N);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, DCT_N, DCT_N);
  bitmap.close();

  const imageData = ctx.getImageData(0, 0, DCT_N, DCT_N);
  const pixels = imageData.data;

  // Convert to grayscale (DCT_N * DCT_N = 1024 pixels)
  const gray = new Uint8Array(DCT_N * DCT_N);
  for (let i = 0; i < gray.length; i++) {
    const o = i * 4;
    gray[i] = Math.round(0.299 * pixels[o] + 0.587 * pixels[o + 1] + 0.114 * pixels[o + 2]);
  }

  const dct = _topLeftDCT(gray); // Float32Array of 64 values

  // pHash: compare each coefficient to the mean of the 63 AC coefficients.
  // DC (index 0) encodes average brightness; excluding it from the mean
  // prevents exposure differences from biasing comparisons.
  let acSum = 0;
  for (let i = 1; i < 64; i++) acSum += dct[i];
  const acMean = acSum / 63;

  const hash = new Uint8Array(8);
  for (let i = 0; i < 64; i++) {
    if ((i === 0 ? dct[0] > 0 : dct[i] > acMean)) {
      hash[i >> 3] |= 1 << (i & 7);
    }
  }

  if (!options.debug) return hash;

  // Debug path: render the 8×8 DCT coefficient grid as a pixelated 32×32 image
  // (each coefficient occupies a 4×4 block). AC coefficients are normalized
  // around 128; DC is shown as neutral gray so it doesn't dominate the display.
  let absMax = 0;
  for (let i = 1; i < 64; i++) {
    const a = Math.abs(dct[i]);
    if (a > absMax) absMax = a;
  }
  if (absMax === 0) absMax = 1;

  for (let v = 0; v < DCT_K; v++) {
    for (let u = 0; u < DCT_K; u++) {
      const coeff = dct[v * DCT_K + u];
      const m =
        u === 0 && v === 0
          ? 128
          : Math.max(0, Math.min(255, Math.round(128 + 127 * (coeff / absMax))));
      for (let dy = 0; dy < 4; dy++) {
        for (let dx = 0; dx < 4; dx++) {
          const idx = ((v * 4 + dy) * DCT_N + (u * 4 + dx)) * 4;
          pixels[idx] = pixels[idx + 1] = pixels[idx + 2] = m;
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
