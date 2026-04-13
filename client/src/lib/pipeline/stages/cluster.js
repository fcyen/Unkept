/**
 * Clustering Stage
 *
 * Pipeline stage signature: (photos: PhotoData[], options, onProgress) => PhotoData[][]
 *
 * Two strategies:
 * - "day" (default): Group photos by calendar date
 * - "timeGap": Group photos by time gaps (configurable threshold)
 *
 * Photos without timestamps are grouped into an "undated" cluster.
 * Output is an array of arrays (clusters), each sorted by timestamp.
 */

const DEFAULT_GAP_MS = 45 * 60 * 1000; // 45 minutes

/**
 * Group photos by calendar date (YYYY-MM-DD).
 * Each day forms one cluster. Within each cluster, photos are sorted by time.
 */
function clusterByDay(photos) {
  const dated = [];
  const undated = [];

  for (const photo of photos) {
    if (photo.timestamp) {
      dated.push(photo);
    } else {
      undated.push(photo);
    }
  }

  // Sort all dated photos by timestamp
  dated.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  // Group by date string
  const byDate = new Map();
  for (const photo of dated) {
    const dt = new Date(photo.timestamp);
    const dateKey = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    if (!byDate.has(dateKey)) byDate.set(dateKey, []);
    byDate.get(dateKey).push(photo);
  }

  const clusters = [...byDate.values()];

  // Undated photos form their own cluster (if any)
  if (undated.length > 0) {
    clusters.push(undated);
  }

  return clusters;
}

/**
 * Group photos by time gaps. When consecutive photos are separated by
 * more than `gapMs` milliseconds, a new cluster starts.
 * Photos without timestamps are grouped into an "undated" cluster.
 */
function clusterByTimeGap(photos, gapMs = DEFAULT_GAP_MS) {
  const dated = [];
  const undated = [];

  for (const photo of photos) {
    if (photo.timestamp) {
      dated.push(photo);
    } else {
      undated.push(photo);
    }
  }

  if (dated.length === 0) {
    return undated.length > 0 ? [undated] : [];
  }

  // Sort by timestamp
  dated.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  const clusters = [];
  let current = [dated[0]];

  for (let i = 1; i < dated.length; i++) {
    const prev = new Date(dated[i - 1].timestamp);
    const curr = new Date(dated[i].timestamp);

    if (curr - prev > gapMs) {
      clusters.push(current);
      current = [];
    }
    current.push(dated[i]);
  }
  clusters.push(current);

  if (undated.length > 0) {
    clusters.push(undated);
  }

  return clusters;
}

/**
 * @param {PhotoData[] | { photos: PhotoData[], burstGroups?: BurstGroup[], burstCandidates?: PhotoData[] }} input
 * @param {{ strategy?: 'day' | 'timeGap', gapMs?: number }} options
 * @param {(done: number, total: number) => void} onProgress
 * @returns {Promise<PhotoData[][] | { clusters: PhotoData[][], burstGroups: BurstGroup[], burstCandidates: PhotoData[] }>}
 *
 * Accepts either a bare `photos[]` (legacy) or the dedup stage output shape
 * `{ photos, burstGroups, burstCandidates }`. When given the object shape,
 * the return value is also an object with `clusters` plus burst data passed
 * through unchanged — burst candidates are NOT clustered (they're only used
 * for live-photo rendering later, not for story layout).
 */
export async function clusterStage(input, options = {}, onProgress) {
  const isObjectInput = !Array.isArray(input);
  const photos = isObjectInput ? input.photos : input;
  const burstGroups = isObjectInput ? (input.burstGroups || []) : [];
  const burstCandidates = isObjectInput ? (input.burstCandidates || []) : [];

  if (photos.length === 0) {
    return isObjectInput
      ? { clusters: [], burstGroups, burstCandidates }
      : [];
  }

  const strategy = options.strategy || 'day';

  let clusters;
  if (strategy === 'timeGap') {
    clusters = clusterByTimeGap(photos, options.gapMs || DEFAULT_GAP_MS);
  } else {
    clusters = clusterByDay(photos);
  }

  if (onProgress) onProgress(photos.length, photos.length);

  return isObjectInput
    ? { clusters, burstGroups, burstCandidates }
    : clusters;
}

// Export individual strategies for direct use and testing
export { clusterByDay, clusterByTimeGap };
