/**
 * Chapter Builder Stage
 *
 * Pipeline stage signature:
 *   ({ clusters, heroIds }: HeroSelectOutput, options, onProgress) => ChapterStructure[]
 *
 * Selects which photos appear in the story and builds the chapter structure.
 * Output drives thumbnail generation (only selected photos get thumbnails).
 *
 * MVP selection logic:
 * - All photos in each cluster are selected (no culling yet)
 * - Each cluster becomes a chapter
 * - Chapter metadata includes: id, photoIds, heroPhotoId, date, median coords
 */

/**
 * @param {{ clusters: PhotoData[][], heroIds: Set<string>, burstGroups?: BurstGroup[], burstCandidates?: PhotoData[] }} input
 * @param {object} options
 * @param {(done: number, total: number) => void} onProgress
 * @returns {Promise<{ chapters: Chapter[], photos: Map<string, PhotoData>, burstGroups: BurstGroup[] }>}
 *
 * Builds chapter structure from clustered photos. Burst candidates (near-
 * duplicates from dedup) are added to the photos map so they receive
 * thumbnails and survive into the final skeleton, but are NOT added to
 * chapter photoIds — the story only shows the representative. The renderer
 * can consult `burstGroups` later to animate bursts as live photos (PR 2F).
 */
export async function chapterBuilderStage(input, options = {}, onProgress) {
  const { clusters, heroIds } = input;
  const burstGroups = input.burstGroups || [];
  const burstCandidates = input.burstCandidates || [];

  if (clusters.length === 0) {
    return { chapters: [], photos: new Map(), burstGroups: [] };
  }

  const chapters = [];
  const selectedPhotos = new Map();
  const total = clusters.length;

  for (let i = 0; i < clusters.length; i++) {
    const cluster = clusters[i];
    if (cluster.length === 0) continue;

    const photoIds = cluster.map((p) => p.id);
    const heroPhotoId = findHeroInCluster(cluster, heroIds);
    const date = getChapterDate(cluster);
    const coords = getMedianCoords(cluster);

    chapters.push({
      id: `chapter_${String(i + 1).padStart(3, '0')}`,
      photoIds,
      heroPhotoId,
      date,
      coords,
    });

    // Track all photos shown in chapters
    for (const photo of cluster) {
      selectedPhotos.set(photo.id, photo);
    }

    if (onProgress) onProgress(i + 1, total);
  }

  // Include burst candidates so they get thumbnails and land in skeleton.photos.
  // They are NOT in any chapter's photoIds — only referenced via burstGroups.
  // Only candidates whose representative was actually selected into a chapter
  // need to be preserved (if the representative was somehow dropped, the
  // burst group is dangling — filter those out).
  const keptPhotoIds = new Set(selectedPhotos.keys());
  const validBurstGroups = burstGroups.filter((g) => keptPhotoIds.has(g.representativeId));

  const validCandidateIds = new Set();
  for (const group of validBurstGroups) {
    for (const id of group.candidateIds) validCandidateIds.add(id);
  }

  for (const photo of burstCandidates) {
    if (validCandidateIds.has(photo.id)) {
      selectedPhotos.set(photo.id, photo);
    }
  }

  return { chapters, photos: selectedPhotos, burstGroups: validBurstGroups };
}

function findHeroInCluster(cluster, heroIds) {
  for (const photo of cluster) {
    if (heroIds.has(photo.id)) return photo.id;
  }
  // Fallback: middle photo
  return cluster[Math.floor(cluster.length / 2)].id;
}

function getChapterDate(cluster) {
  for (const photo of cluster) {
    if (photo.timestamp) {
      const dt = new Date(photo.timestamp);
      return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    }
  }
  return null;
}

/**
 * Compute median GPS coordinates for a cluster.
 * Returns null if no photos have coordinates.
 */
function getMedianCoords(cluster) {
  const withCoords = cluster.filter((p) => p.coords != null);
  if (withCoords.length === 0) return null;

  const lats = withCoords.map((p) => p.coords.lat).sort((a, b) => a - b);
  const lngs = withCoords.map((p) => p.coords.lng).sort((a, b) => a - b);

  const mid = Math.floor(withCoords.length / 2);
  return {
    lat: lats[mid],
    lng: lngs[mid],
  };
}

export { findHeroInCluster, getChapterDate, getMedianCoords };
