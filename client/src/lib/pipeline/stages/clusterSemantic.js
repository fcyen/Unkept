/**
 * Semantic Clustering Stage — k-means on CLIP embeddings
 *
 * Pipeline stage signature: same as clusterStage
 *   ({ photos, burstGroups, burstCandidates }, options, onProgress)
 *     => { clusters: PhotoData[][], burstGroups, burstCandidates }
 *
 * Groups photos by visual content rather than calendar day. Photos with
 * null embeddings (server unavailable or decode failed) are collected into
 * a single "unembedded" cluster at the end.
 *
 * Algorithm: k-means++ initialisation → cosine similarity (equivalent to
 * dot product on L2-normalised vectors) → iterate until convergence or
 * maxIter. k is derived from photo count unless overridden.
 *
 * Why cosine similarity: CLIP embeddings are L2-normalised by the server,
 * so dot product == cosine similarity. Photos of similar scenes (beach,
 * city, food) cluster tightly; dissimilar scenes are far apart.
 */

// ── k-means ──────────────────────────────────────────────────────────────────

/**
 * Dot product of two Float32Arrays (= cosine similarity when L2-normalised).
 */
function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/**
 * Return index of the centroid closest to `vec` (highest cosine similarity).
 */
function nearestCentroid(vec, centroids) {
  let best = -Infinity;
  let idx = 0;
  for (let j = 0; j < centroids.length; j++) {
    const sim = dot(vec, centroids[j]);
    if (sim > best) { best = sim; idx = j; }
  }
  return idx;
}

/**
 * k-means++ initialisation: first centroid chosen at random, each subsequent
 * centroid chosen with probability proportional to squared distance from the
 * nearest existing centroid. Produces better starting points than random.
 */
function initCentroidsKMeansPlusPlus(vecs, k) {
  const dim = vecs[0].length;
  const centroids = [];

  // First centroid: random
  centroids.push(Float32Array.from(vecs[Math.floor(Math.random() * vecs.length)]));

  for (let c = 1; c < k; c++) {
    // For each vec, distance² to its nearest existing centroid
    // (1 - cosine_similarity, since vecs are normalised)
    const dists = vecs.map((v) => {
      let minDist = Infinity;
      for (const cen of centroids) {
        const d = 1 - dot(v, cen);
        if (d < minDist) minDist = d;
      }
      return minDist * minDist;
    });

    // Sample proportional to dist²
    const total = dists.reduce((s, d) => s + d, 0);
    let r = Math.random() * total;
    let chosen = vecs.length - 1;
    for (let i = 0; i < dists.length; i++) {
      r -= dists[i];
      if (r <= 0) { chosen = i; break; }
    }
    centroids.push(Float32Array.from(vecs[chosen]));
  }

  return centroids;
}

/**
 * Run k-means on an array of Float32Arrays.
 * Returns an array of cluster index assignments (same length as vecs).
 */
function kmeans(vecs, k, maxIter = 50) {
  if (vecs.length <= k) {
    return vecs.map((_, i) => i); // trivial: one cluster per photo
  }

  const dim = vecs[0].length;
  let centroids = initCentroidsKMeansPlusPlus(vecs, k);
  let assignments = new Int32Array(vecs.length);

  for (let iter = 0; iter < maxIter; iter++) {
    // Assign step
    let changed = false;
    for (let i = 0; i < vecs.length; i++) {
      const prev = assignments[i];
      assignments[i] = nearestCentroid(vecs[i], centroids);
      if (assignments[i] !== prev) changed = true;
    }
    if (!changed) break;

    // Update step: recompute centroids as mean of assigned vectors
    const sums = Array.from({ length: k }, () => new Float32Array(dim));
    const counts = new Int32Array(k);
    for (let i = 0; i < vecs.length; i++) {
      const c = assignments[i];
      counts[c]++;
      for (let d = 0; d < dim; d++) sums[c][d] += vecs[i][d];
    }

    for (let c = 0; c < k; c++) {
      if (counts[c] === 0) {
        // Empty cluster — reinitialise to a random vector (keeps k stable)
        centroids[c] = Float32Array.from(vecs[Math.floor(Math.random() * vecs.length)]);
        continue;
      }
      // Normalise the mean so centroids stay on the unit sphere
      let norm = 0;
      for (let d = 0; d < dim; d++) norm += sums[c][d] * sums[c][d];
      norm = Math.sqrt(norm);
      for (let d = 0; d < dim; d++) centroids[c][d] = sums[c][d] / (norm || 1);
    }
  }

  return assignments;
}

// ── Stage ────────────────────────────────────────────────────────────────────

/**
 * Heuristic: roughly one cluster per 6–10 photos, clamped to [2, 12].
 */
function defaultK(n) {
  return Math.max(2, Math.min(12, Math.round(n / 8)));
}

/**
 * @param {{ photos: PhotoData[], burstGroups: BurstGroup[], burstCandidates: PhotoData[] }} input
 * @param {{ k?: number }} options  — override number of clusters
 * @param {(done: number, total: number) => void} onProgress
 */
export async function clusterSemanticStage(input, options = {}, onProgress) {
  const photos = input.photos ?? [];
  const burstGroups = input.burstGroups ?? [];
  const burstCandidates = input.burstCandidates ?? [];

  // Split: photos with embeddings vs without
  const embedded = photos.filter((p) => p.embedding != null);
  const unembedded = photos.filter((p) => p.embedding == null);

  if (embedded.length === 0) {
    // No embeddings available — fall back to single cluster (time-based
    // cluster stage should be used instead, but this is a safe fallback)
    console.warn('[clusterSemantic] No embeddings found — returning single cluster.');
    if (onProgress) onProgress(photos.length, photos.length);
    return {
      clusters: photos.length > 0 ? [photos] : [],
      burstGroups,
      burstCandidates,
    };
  }

  const k = options.k ?? defaultK(embedded.length);
  const vecs = embedded.map((p) => p.embedding);
  const assignments = kmeans(vecs, k);

  // Build clusters from assignments
  const clusters = Array.from({ length: k }, () => []);
  for (let i = 0; i < embedded.length; i++) {
    clusters[assignments[i]].push(embedded[i]);
  }

  // Sort photos within each cluster by timestamp (stable visual order)
  for (const cluster of clusters) {
    cluster.sort((a, b) => {
      if (!a.timestamp) return 1;
      if (!b.timestamp) return -1;
      return new Date(a.timestamp) - new Date(b.timestamp);
    });
  }

  // Remove empty clusters (can occur with reinitialised centroids)
  const nonEmpty = clusters.filter((c) => c.length > 0);

  // Sort clusters chronologically by their earliest photo timestamp
  nonEmpty.sort((a, b) => {
    const ta = a[0]?.timestamp ? new Date(a[0].timestamp) : Infinity;
    const tb = b[0]?.timestamp ? new Date(b[0].timestamp) : Infinity;
    return ta - tb;
  });

  // Append unembedded photos as a trailing cluster if any
  if (unembedded.length > 0) nonEmpty.push(unembedded);

  if (onProgress) onProgress(photos.length, photos.length);

  return { clusters: nonEmpty, burstGroups, burstCandidates };
}
