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
import { DEMO_MODE } from '../../demoMode.js';

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

// Photos per POST. Small batches keep request bodies well under the proxy's
// body limit and give the provider a steady trickle instead of one burst;
// the proxy additionally caps in-flight calls per provider.
const BATCH_SIZE = 4;

/** Error thrown for a non-2xx proxy response, carrying the HTTP status. */
class ProxyError extends Error {
  constructor(status) {
    super(`Aesthetic proxy error: ${status}`);
    this.status = status;
  }
}

async function postScores(items, serverUrl) {
  const response = await fetch(`${serverUrl}/api/aesthetic`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ photos: items }),
  });
  if (!response.ok) throw new ProxyError(response.status);
  const { scores } = await response.json();
  const map = new Map();
  for (const s of scores ?? []) {
    if (s && s.id) map.set(s.id, s);
  }
  return map;
}

/** Turn a thrown batch error into the same `{ kind, status, message }` shape the proxy uses. */
export function errorFromBatchFailure(err) {
  const status = typeof err?.status === 'number' ? err.status : null;
  if (status === 429) return { kind: 'rate_limit', status, message: 'Provider rate limit (429)' };
  return { kind: 'failed', status, message: err?.message ?? 'Request failed' };
}

/**
 * Normalise one proxy result into `{ models, primary, error }`.
 * Accepts the multi-model shape `{ id, models: [...] }` and the legacy flat
 * shape `{ id, score, keep, reason }`. models[0] is the primary provider.
 */
export function normaliseResult(s) {
  const models = Array.isArray(s.models)
    ? s.models.filter(Boolean).map((m) => ({
      model: m.model ?? null,
      score: m.score ?? null,
      keep: m.keep ?? null,
      reason: m.reason ?? '',
      ...(m.cached ? { cached: true } : {}),
      ...(m.error ? { error: m.error } : {}),
    }))
    : [{ model: s.model ?? null, score: s.score ?? null, keep: s.keep ?? null, reason: s.reason ?? '' }];
  const primary = models[0] ?? null;
  // Photo-level error only when no model produced a score at all.
  const allFailed = models.length > 0 && models.every((m) => m.score == null);
  const error = allFailed ? (models.find((m) => m.error)?.error ?? { kind: 'failed', message: 'No score returned' }) : null;
  return { models, primary, error };
}

function attachNullScores(clusters) {
  for (const cluster of clusters) {
    for (const photo of cluster) {
      photo.aestheticScore = null;
      photo.aestheticKeep = null;
      photo.aestheticReason = null;
      photo.aestheticModels = null;
      photo.aestheticError = null;
      photo.aestheticCandidate = false;
    }
  }
}

/**
 * Stage-level outcome, attached to the output as `aestheticStatus` so the
 * debug view can render a specific empty/error state:
 *   'ok'            proxy answered (individual photos may still carry errors)
 *   'demo'          DEMO_MODE — stage intentionally made no network calls
 *   'unconfigured'  proxy is up but has no provider keys (HTTP 503)
 *   'unreachable'   proxy did not answer the health probe
 *   'empty'         nothing to score
 *
 * @param {{ clusters: PhotoData[][], burstGroups?: BurstGroup[], burstCandidates?: PhotoData[] }} input
 * @param {{ serverUrl?: string, topNPerCluster?: number, batchSize?: number, demoMode?: boolean }} options
 * @param {(done: number, total: number) => void} onProgress
 */
export async function aestheticScoreStage(input, options = {}, onProgress) {
  const clusters = input.clusters ?? [];
  const serverUrl = options.serverUrl ?? AESTHETIC_SERVER;
  const topN = options.topNPerCluster ?? TOP_N_PER_CLUSTER;
  const batchSize = Math.max(1, options.batchSize ?? BATCH_SIZE);
  const demoMode = options.demoMode ?? DEMO_MODE;

  // Default every photo to null so heroSelect's fallback path stays clean.
  attachNullScores(clusters);

  // Demo mode: hard stop before any network I/O. No probe, no POST.
  if (demoMode) {
    input.aestheticStatus = 'demo';
    if (onProgress) onProgress(1, 1);
    return input;
  }

  if (clusters.length === 0) {
    input.aestheticStatus = 'empty';
    if (onProgress) onProgress(0, 0);
    return input;
  }

  // Health probe — if the proxy is down, leave scores null and bail.
  try {
    const probe = await fetch(`${serverUrl}/api/aesthetic/health`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!probe.ok) {
      input.aestheticStatus = probe.status === 503 ? 'unconfigured' : 'unreachable';
      throw new Error('unhealthy');
    }
  } catch {
    input.aestheticStatus = input.aestheticStatus ?? 'unreachable';
    console.warn(
      '[aestheticScore] proxy', input.aestheticStatus, 'at', serverUrl,
      '— skipping vision scoring. Heroes will fall back to the classical heuristic.',
    );
    if (onProgress) onProgress(1, 1);
    return input;
  }
  input.aestheticStatus = 'ok';

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
  for (const p of candidates) p.aestheticCandidate = true;

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

  const items = [];
  candidates.forEach((p, i) => {
    if (dataUrls[i]) items.push({ id: p.id, data: dataUrls[i] });
    else p.aestheticError = { kind: 'failed', status: null, message: 'Could not decode this photo' };
  });

  // Batches go out sequentially; a failed batch (e.g. 429) marks only its own
  // photos and the rest still get scored.
  const scoreMap = new Map();
  const batchErrors = new Map();
  let sent = 0;
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    try {
      const m = await postScores(batch, serverUrl);
      for (const [id, s] of m) scoreMap.set(id, s);
    } catch (err) {
      console.warn('[aestheticScore] batch failed:', err.message);
      const e = errorFromBatchFailure(err);
      for (const it of batch) batchErrors.set(it.id, e);
    }
    sent += batch.length;
    if (onProgress) onProgress(Math.round(total * 0.5 + sent * 0.5), total);
  }

  for (const photo of candidates) {
    const s = scoreMap.get(photo.id);
    if (!s) {
      if (!photo.aestheticError) {
        photo.aestheticError = batchErrors.get(photo.id)
          ?? { kind: 'failed', status: null, message: 'No score returned for this photo' };
      }
      continue;
    }
    const { models, primary, error } = normaliseResult(s);
    photo.aestheticModels = models;
    photo.aestheticScore = primary?.score ?? null;
    photo.aestheticKeep = primary?.keep ?? null;
    photo.aestheticReason = primary?.reason ?? '';
    photo.aestheticError = error;
  }

  if (onProgress) onProgress(total, total);
  return input;
}
