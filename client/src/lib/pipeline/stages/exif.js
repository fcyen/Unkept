/**
 * EXIF Extraction Stage
 *
 * Pipeline stage signature: (files: File[], options, onProgress) => PhotoData[]
 *
 * Wraps the EXIF web worker to extract timestamp + GPS data from files in
 * batches of 50. Returns PhotoData objects with metadata but no pixel data.
 */
import ExifWorker from '../../workers/exif.worker.js?worker';

/**
 * @param {File[]} files - Array of image File objects
 * @param {object} options - (unused, reserved for future options)
 * @param {(done: number, total: number) => void} onProgress
 * @returns {Promise<PhotoData[]>}
 */
export async function exifStage(files, options, onProgress) {
  if (files.length === 0) return [];

  return new Promise((resolve, reject) => {
    const worker = new ExifWorker();
    const results = new Array(files.length);

    worker.onmessage = (e) => {
      const { type, batch, progress, total } = e.data;

      if (type === 'batch') {
        for (const item of batch) {
          results[item.index] = {
            id: `photo_${item.index}`,
            name: item.name,
            size: item.size,
            file: files[item.index],
            timestamp: item.timestamp,
            coords: item.latitude != null && item.longitude != null
              ? { lat: item.latitude, lng: item.longitude }
              : null,
            make: item.make ?? null,
            model: item.model ?? null,
            lensModel: item.lensModel ?? null,
            iso: item.iso ?? null,
            fNumber: item.fNumber ?? null,
            exposureTime: item.exposureTime ?? null,
            width: item.width ?? null,
            height: item.height ?? null,
            orientation: item.orientation ?? null,
            thumbnailUrl: null,
            thumbnailHeroUrl: null,
            thumbnailFailed: false,
            qualityScore: null,
            faces: null,
          };
        }
        if (onProgress) onProgress(progress, total);
      }

      if (type === 'done') {
        worker.terminate();
        resolve(results);
      }
    };

    worker.onerror = (err) => {
      worker.terminate();
      reject(new Error(`EXIF worker error: ${err.message}`));
    };

    worker.postMessage({ files });
  });
}
