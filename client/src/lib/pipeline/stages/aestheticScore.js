/**
 * Aesthetic Scoring Stage — vision-model keeper scoring via swappable proxy
 *
 * Pipeline stage signature:
 *   ({ clusters, burstGroups, burstCandidates }, options, onProgress)
 *     => { clusters, burstGroups, burstCandidates }
 *
 * Runs after cluster, before heroSelect. Attaches `aestheticScore`,
 * `aestheticKeep`, and `aestheticReason` to each photo in each cluster —
 * these reflect the PRIMARY provider and are what heroSelect consumes.
 *
 * When the proxy has a second provider configured, each photo also gets
 * `aestheticModels: [{ model, score, keep, reason }, ...]` holding every
 * model's result. The `/pipeline` view renders these side by side; the
 * pipeline itself still acts on the primary model only.
 *
 * Cost pre-filter: per cluster, rank by a cheap on-the-fly Laplacian
 * variance and send only the top-N candidates (N=3) to the proxy. The
 * cheap heuristic gates the expensive model.
 *
 * Graceful degradation: health-probes the proxy first; on failure (server
 * down, individual decode error, batch error) the relevant scores stay
 * null and the heroSelect stage falls back to its existing logic.
 *
 * Privacy: only ≤512px JPEG thumbnails leave the browser. The original
 * File bytes never reach the server.
 *
 * Proxy must be running at http://localhost:3001 with LLM_BASE_URL /
 * LLM_API_KEY / LLM_MODEL configured. See docs/ai-aesthetic-proxy.md.
 */

import { parallelMap, DEFAULT_STAGE_CONCURRENCY } from '../concurrency.js';

const AESTHETIC_SERVER = 'http://localhost:3001';
// Send 512px JPEGs — small enough to keep request bodies reasonable and
// large enough for the vision model to read faces, expressions, sharpness.
const SEND_SIZE = 512;
// Laplacian pre-filter runs on a tiny canvas; we only need a relative
// ordering of sharpness within a cluster, not absolute calibration.
const FILTER_SIZE = 128;
// Per-cluster cap on photos sent to the LLM. Keeps cost bounded.
const TOP_N_PER_CLUSTER = 3;

/**
 * Decode a File and resize to SEND_SIZE on the longest edge, return a
 * JPEG data URL. Mirrors `fileToClipDataUrl` in the embedding stage.
 */
async function fileToDataUrl(file) {
  const bitmap = await createImageBitmap(file);
  const scale = SEND_SIZE / Math.max(bitmap.width, bitmap.height);
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return 'data:image/jpeg;base64,' + btoa(binary);
}

/**
 * Cheap Laplacian variance computed on a 128px canvas. Used to rank
 * photos within a cluster so we only send the top-N to the LLM.
 */
async function laplacianVariance(file) {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = FILTER_SIZE / Math.max(bitmap.width, bitmap.height);
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    const imageData = ctx.getImageData(0, 0, w, h);
    const px = imageData.data;
    const gray = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const o = i * 4;
      gray[i] = 0.299 * px[o] + 0.587 * px[o + 1] + 0.114 * px[o + 2];
    }
    let sum = 0, sumSq = 0, n = 0;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = y * w + x;
        const lap =
          gray[idx - w] + gray[idx + w] + gray[idx - 1] + gray[idx + 1] - 4 * gray[idx];
        sum += lap;
        sumSq += lap * lap;
        n++;
      }
    }
    if (n === 0) return 0;
    const mean = sum / n;
    return Math.max(0, sumSq / n - mean * mean);
  } catch {
    return 0;
  }
}

async function postScores(items, serverUrl) {
  const response = await fetch(`${serverUrl}/api/aesthetic`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ photos: items }),
  });
  if (!response.ok) throw new Error(`Aesthetic proxy error: ${response.status}`);
  const { scores } = await response.json();
  const map = new Map();
  for (const s of scores ?? []) {
    if (s && s.id) map.set(s.id, s);
  }
  return map;
}

function attachNullScores(clusters) {
  for (const cluster of clusters) {
    for (const photo of cluster) {
      photo.aestheticScore = null;
      photo.aestheticKeep = null;
      photo.aestheticReason = null;
      photo.aestheticModels = null;
    }
  }
}

/**
 * @param {{ clusters: PhotoData[][], burstGroups?: BurstGroup[], burstCandidates?: PhotoData[] }} input
 * @param {{ serverUrl?: string, topNPerCluster?: number }} options
 * @param {(done: number, total: number) => void} onProgress
 */
export async function aestheticScoreStage(input, options = {}, onProgress) {
  const clusters = input.clusters ?? [];
  const serverUrl = options.serverUrl ?? AESTHETIC_SERVER;
  const topN = options.topNPerCluster ?? TOP_N_PER_CLUSTER;

  // Default every photo to null so heroSelect's fallback path stays clean.
  attachNullScores(clusters);

  if (clusters.length === 0) {
    if (onProgress) onProgress(0, 0);
    return input;
  }

  // Health probe — if the proxy is down, leave scores null and bail.
  try {
    const probe = await fetch(`${serverUrl}/api/aesthetic/health`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!probe.ok) throw new Error('unhealthy');
  } catch {
    console.warn(
      '[aestheticScore] proxy unreachable at', serverUrl,
      '— skipping vision scoring. Heroes will fall back to the classical heuristic.',
    );
    if (onProgress) onProgress(1, 1);
    return input;
  }

  // Per-cluster pre-filter: rank by cheap Laplacian variance, keep top-N.
  // Clusters of size ≤ topN are sent whole.
  const candidates = [];
  for (const cluster of clusters) {
    if (cluster.length === 0) continue;
    if (cluster.length <= topN) {
      for (const p of cluster) if (p.file) candidates.push(p);
      continue;
    }
    const variances = await Promise.all(
      cluster.map((p) => (p.file ? laplacianVariance(p.file) : Promise.resolve(0))),
    );
    const ranked = cluster
      .map((p, i) => ({ photo: p, variance: variances[i] }))
      .filter(({ photo }) => photo.file)
      .sort((a, b) => b.variance - a.variance)
      .slice(0, topN);
    for (const { photo } of ranked) candidates.push(photo);
  }

  const total = candidates.length;
  if (total === 0) {
    if (onProgress) onProgress(1, 1);
    return input;
  }

  // Encode candidates to JPEG data URLs in parallel.
  let encoded = 0;
  const dataUrls = await parallelMap(
    candidates,
    DEFAULT_STAGE_CONCURRENCY,
    async (photo) => {
      try {
        return await fileToDataUrl(photo.file);
      } catch {
        return null;
      }
    },
    () => {
      encoded++;
      if (onProgress) onProgress(Math.round(encoded * 0.5), total);
    },
  );

  const items = candidates
    .map((p, i) => (dataUrls[i] ? { id: p.id, data: dataUrls[i] } : null))
    .filter(Boolean);

  let scoreMap = new Map();
  if (items.length > 0) {
    try {
      scoreMap = await postScores(items, serverUrl);
    } catch (err) {
      console.warn('[aestheticScore] batch failed:', err.message);
    }
  }

  for (const photo of candidates) {
    const s = scoreMap.get(photo.id);
    if (!s) continue;
    // New multi-model shape: { id, models: [{ model, score, keep, reason }] }.
    // Legacy flat shape: { id, score, keep, reason }. Normalise to a list so
    // the comparison view has a uniform structure, with models[0] primary.
    const models = Array.isArray(s.models)
      ? s.models
      : [{ model: s.model ?? null, score: s.score ?? null, keep: s.keep ?? null, reason: s.reason ?? '' }];
    const primary = models[0] ?? null;
    photo.aestheticModels = models;
    photo.aestheticScore = primary?.score ?? null;
    photo.aestheticKeep = primary?.keep ?? null;
    photo.aestheticReason = primary?.reason ?? '';
  }

  if (onProgress) onProgress(total, total);
  return input;
}
