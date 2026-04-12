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
 * @param {{ clusters: PhotoData[][], heroIds: Set<string> }} input
 * @param {object} options
 * @param {(done: number, total: number) => void} onProgress
 * @returns {Promise<{ chapters: Chapter[], photos: Map<string, PhotoData> }>}
 */
export async function chapterBuilderStage(input, options = {}, onProgress) {
  const { clusters, heroIds } = input;

  if (clusters.length === 0) {
    return { chapters: [], photos: new Map() };
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

    // Track all selected photos
    for (const photo of cluster) {
      selectedPhotos.set(photo.id, photo);
    }

    if (onProgress) onProgress(i + 1, total);
  }

  return { chapters, photos: selectedPhotos };
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
