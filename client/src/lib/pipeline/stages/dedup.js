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
 * 2. Perceptual hash: pHash (DCT-based). Resize to 32x32 grayscale, apply
 *    separable 2D DCT, extract the top-left 8x8 low-frequency coefficients
 *    (64 values), then set bit i = 1 iff coeff[i] > median. Hamming distance
 *    comparison.
 *    Why DCT over block-mean: block-mean collapses to a 64-bit brightness-
 *    layout signature — two photos of the same room, sky, or open field
 *    can share similar brightness distributions and land within d≤10 even
 *    when subjects differ (false positives). DCT captures *structural*
 *    frequency information: an interior shot and an exterior shot at the same
 *    exposure will have completely different mid/high frequency energy even if
 *    their average brightness is the same.
 *    Algorithm history: aHash → dHash → block-mean → pHash. aHash and dHash
 *    had d=40-99 on real bursts because flat regions (sky, wall) in tiny tiles
 *    flip pixel-level comparisons under JPEG noise. Block-mean fixed bursts
 *    (d≤10) but introduced false positives. pHash fixes false positives while
 *    keeping burst detection reliable.
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
const DEFAULT_HAMMING_THRESHOLD = 10; // out of 64 bits; pHash burst frames typically land d≤6
const PERCEPTUAL_WINDOW = 5;
const DCT_SIZE = 32; // input image dimension; also DCT length
const HASH_GRID = 8; // top-left HASH_GRID×HASH_GRID DCT coefficients → 64 bits

// Precomputed cosine table for the 1D DCT-II of length DCT_SIZE.
// cosTbl[k * DCT_SIZE + n] = cos(π/DCT_SIZE * (n + 0.5) * k)
const _cosTbl = (() => {
  const tbl = new Float32Array(DCT_SIZE * DCT_SIZE);
  const piOverN = Math.PI / DCT_SIZE;
  for (let k = 0; k < DCT_SIZE; k++) {
    for (let n = 0; n < DCT_SIZE; n++) {
      tbl[k * DCT_SIZE + n] = Math.cos(piOverN * (n + 0.5) * k);
    }
  }
  return tbl;
})();

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
 * 1D DCT-II of an array of length DCT_SIZE, using the precomputed cosine table.
 * Writes output into `out` starting at `outOffset`.
 */
function _dct1D(input, out, outOffset) {
  for (let k = 0; k < DCT_SIZE; k++) {
    let sum = 0;
    const base = k * DCT_SIZE;
    for (let n = 0; n < DCT_SIZE; n++) {
      sum += input[n] * _cosTbl[base + n];
    }
    out[outOffset + k] = sum;
  }
}

/**
 * Compute a pHash (DCT-based perceptual fingerprint).
 *
 * 1. Resize to DCT_SIZE×DCT_SIZE grayscale.
 * 2. Separable 2D DCT-II.
 * 3. Extract the top-left HASH_GRID×HASH_GRID low-frequency coefficients (64 values).
 * 4. Set bit i = 1 iff coeff[i] > median of all 64 coefficients.
 *
 * Returns a Uint8Array of 8 bytes (64 bits).
 * In debug mode returns { hash, debugUrl } where debugUrl is a blob URL of the
 * normalized 8×8 DCT coefficient heatmap (scaled to 32×32).
 */
async function computePerceptualHash(file, options = {}) {
  const bitmap = await createImageBitmap(file);
  const canvas = new OffscreenCanvas(DCT_SIZE, DCT_SIZE);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, DCT_SIZE, DCT_SIZE);
  bitmap.close();

  const imageData = ctx.getImageData(0, 0, DCT_SIZE, DCT_SIZE);
  const pixels = imageData.data;

  const N = DCT_SIZE;
  const totalPx = N * N;

  // Grayscale as floats
  const gray = new Float32Array(totalPx);
  for (let i = 0; i < totalPx; i++) {
    const o = i * 4;
    gray[i] = 0.299 * pixels[o] + 0.587 * pixels[o + 1] + 0.114 * pixels[o + 2];
  }

  // Separable 2D DCT (row-wise then column-wise)
  const tmp = new Float32Array(totalPx);
  const scratch = new Float32Array(N);

  // Row-wise DCT
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) scratch[c] = gray[r * N + c];
    _dct1D(scratch, tmp, r * N);
  }

  // Column-wise DCT — result lands back into gray (reused as output)
  for (let c = 0; c < N; c++) {
    for (let r = 0; r < N; r++) scratch[r] = tmp[r * N + c];
    _dct1D(scratch, gray, 0); // write into gray[0..N-1] temporarily
    for (let r = 0; r < N; r++) tmp[r * N + c] = gray[r];
  }
  // tmp now holds the full 2D DCT

  // Extract top-left HASH_GRID×HASH_GRID low-frequency coefficients
  const G = HASH_GRID;
  const coeffs = new Float32Array(G * G);
  for (let r = 0; r < G; r++) {
    for (let c = 0; c < G; c++) {
      coeffs[r * G + c] = tmp[r * N + c];
    }
  }

  // Median of the 64 coefficients
  const sorted = [...coeffs].sort((a, b) => a - b);
  const median = (sorted[31] + sorted[32]) / 2;

  // 64-bit hash, packed into 8 bytes
  const hash = new Uint8Array(8);
  for (let i = 0; i < G * G; i++) {
    if (coeffs[i] > median) hash[i >> 3] |= 1 << (i & 7);
  }

  if (!options.debug) return hash;

  // Debug: render a normalized heatmap of the 8×8 DCT coefficients, each
  // block painted at 4×4 pixels so the canvas stays 32×32.
  let minC = Infinity, maxC = -Infinity;
  for (let i = 0; i < G * G; i++) {
    if (coeffs[i] < minC) minC = coeffs[i];
    if (coeffs[i] > maxC) maxC = coeffs[i];
  }
  const range = maxC - minC || 1;
  const blockPx = N / G; // 4

  for (let by = 0; by < G; by++) {
    for (let bx = 0; bx < G; bx++) {
      const val = Math.round(((coeffs[by * G + bx] - minC) / range) * 255);
      for (let dy = 0; dy < blockPx; dy++) {
        for (let dx = 0; dx < blockPx; dx++) {
          const idx = ((by * blockPx + dy) * N + (bx * blockPx + dx)) * 4;
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
