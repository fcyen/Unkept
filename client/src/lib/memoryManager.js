/**
 * Memory Manager
 *
 * Tracks blob URLs and File references by pipeline stage, providing
 * controlled revocation at stage boundaries.
 *
 * Usage:
 *   const mm = createMemoryManager();
 *   mm.trackBlobUrl('exif', url);
 *   mm.revokeStage('exif');  // revokes all URLs tracked under 'exif'
 *   mm.revokeAll();          // revokes everything
 */

/**
 * Create a new MemoryManager instance.
 */
export function createMemoryManager() {
  // stage -> Set<string> of blob URLs
  const blobUrls = new Map();

  // stage -> Set<File> references to clear
  const fileRefs = new Map();

  return {
    /**
     * Track a blob URL under a given stage name.
     */
    trackBlobUrl(stage, url) {
      if (!url || !url.startsWith('blob:')) return;
      if (!blobUrls.has(stage)) blobUrls.set(stage, new Set());
      blobUrls.get(stage).add(url);
    },

    /**
     * Track multiple blob URLs under a given stage name.
     */
    trackBlobUrls(stage, urls) {
      for (const url of urls) {
        this.trackBlobUrl(stage, url);
      }
    },

    /**
     * Track a File reference that should be cleared at a stage boundary.
     */
    trackFileRef(stage, file) {
      if (!file) return;
      if (!fileRefs.has(stage)) fileRefs.set(stage, new Set());
      fileRefs.get(stage).add(file);
    },

    /**
     * Revoke all blob URLs for a specific stage.
     */
    revokeStage(stage) {
      const urls = blobUrls.get(stage);
      if (urls) {
        for (const url of urls) {
          try {
            URL.revokeObjectURL(url);
          } catch {
            // Already revoked or invalid
          }
        }
        blobUrls.delete(stage);
      }
      // Clear file refs for this stage
      fileRefs.delete(stage);
    },

    /**
     * Revoke all tracked blob URLs across all stages.
     */
    revokeAll() {
      for (const [stage] of blobUrls) {
        this.revokeStage(stage);
      }
    },

    /**
     * Strip File references from photo objects (call after thumbnail generation).
     * This ensures no File objects survive into the serialised Story Skeleton.
     */
    stripFileReferences(photos) {
      if (photos instanceof Map) {
        for (const [, photo] of photos) {
          delete photo.file;
        }
      } else if (Array.isArray(photos)) {
        for (const photo of photos) {
          delete photo.file;
        }
      }
    },

    /**
     * Get count of tracked blob URLs (for debugging/testing).
     */
    getTrackedCount() {
      let count = 0;
      for (const urls of blobUrls.values()) {
        count += urls.size;
      }
      return count;
    },

    /**
     * Get stages that still have tracked URLs.
     */
    getActiveStages() {
      return [...blobUrls.keys()];
    },
  };
}
