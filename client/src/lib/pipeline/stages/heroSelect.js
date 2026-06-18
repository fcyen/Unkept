/**
 * Hero Selection Stage
 *
 * Pipeline stage signature: (clusters: PhotoData[][], options, onProgress) => PhotoData[][]
 *
 * Selects a hero photo for each cluster. The hero is used as the featured
 * image for the chapter.
 *
 * MVP strategy: pick the middle photo in each cluster, with a boost for
 * clusters that fall on survey-selected "highlight" dates.
 *
 * Each cluster's photos get a `_isHero` marker (internal, stripped later).
 * Returns the same cluster structure with hero annotations.
 */

/**
 * @param {PhotoData[][] | { clusters: PhotoData[][], burstGroups?: BurstGroup[], burstCandidates?: PhotoData[] }} input
 * @param {{ highlightDates?: string[] }} options - survey responses
 * @param {(done: number, total: number) => void} onProgress
 * @returns {Promise<{ clusters: PhotoData[][], heroIds: Set<string>, burstGroups: BurstGroup[], burstCandidates: PhotoData[] }>}
 *
 * Accepts either a bare `clusters[][]` or the cluster stage output shape
 * `{ clusters, burstGroups, burstCandidates }`. Burst data passes through unchanged.
 */
export async function heroSelectStage(input, options = {}, onProgress) {
  const isObjectInput = !Array.isArray(input);
  const clusters = isObjectInput ? input.clusters : input;
  const burstGroups = isObjectInput ? (input.burstGroups || []) : [];
  const burstCandidates = isObjectInput ? (input.burstCandidates || []) : [];

  if (clusters.length === 0) {
    return { clusters: [], heroIds: new Set(), burstGroups, burstCandidates };
  }

  const highlightDates = new Set(options.highlightDates || []);
  const heroIds = new Set();
  const total = clusters.length;

  for (let i = 0; i < clusters.length; i++) {
    const cluster = clusters[i];
    if (cluster.length === 0) continue;

    const heroIndex = selectHeroIndex(cluster, highlightDates);
    heroIds.add(cluster[heroIndex].id);

    if (onProgress) onProgress(i + 1, total);
  }

  return { clusters, heroIds, burstGroups, burstCandidates };
}

/**
 * Select the best hero photo index within a cluster.
 *
 * Logic, in priority order:
 * 1. If any photo has an `aestheticScore` (from the vision proxy), pick the
 *    highest. The vision model can see what sharpness alone can't —
 *    expressions, eye contact, composition.
 * 2. Otherwise, if the cluster falls on a highlight date and has quality
 *    scores, prefer the highest-scoring photo.
 * 3. Otherwise, the middle photo — avoids first/last arrival shots.
 */
function selectHeroIndex(cluster, highlightDates) {
  // 1. Vision aesthetic score takes precedence when present.
  let bestAestheticIdx = -1;
  let bestAestheticScore = -1;
  for (let i = 0; i < cluster.length; i++) {
    if (cluster[i].aestheticScore != null && cluster[i].aestheticScore > bestAestheticScore) {
      bestAestheticScore = cluster[i].aestheticScore;
      bestAestheticIdx = i;
    }
  }
  if (bestAestheticIdx !== -1) return bestAestheticIdx;

  // 2. Highlight-date quality-score path.
  const clusterDate = getClusterDate(cluster);
  const isHighlighted = clusterDate && highlightDates.has(clusterDate);

  if (isHighlighted) {
    let bestIdx = Math.floor(cluster.length / 2);
    let bestScore = -1;

    for (let i = 0; i < cluster.length; i++) {
      if (cluster[i].qualityScore != null && cluster[i].qualityScore > bestScore) {
        bestScore = cluster[i].qualityScore;
        bestIdx = i;
      }
    }
    return bestIdx;
  }

  // 3. Default: middle photo.
  return Math.floor(cluster.length / 2);
}

/**
 * Get the date string (YYYY-MM-DD) for a cluster based on its photos.
 */
function getClusterDate(cluster) {
  for (const photo of cluster) {
    if (photo.timestamp) {
      const dt = new Date(photo.timestamp);
      return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    }
  }
  return null;
}

export { selectHeroIndex, getClusterDate };
