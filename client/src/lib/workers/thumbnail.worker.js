/**
 * Web Worker for thumbnail generation using OffscreenCanvas.
 *
 * Receives File objects via postMessage, resizes each to 400px max dimension,
 * and posts back JPEG blobs. The main thread creates thumbnailUrl via
 * URL.createObjectURL().
 *
 * Browser requirement: OffscreenCanvas support (Chrome, Firefox, Safari 16.4+).
 */

const MAX_SIZE = 400;
const JPEG_QUALITY = 0.7;
const BATCH_SIZE = 50;

async function generateThumbnail(file) {
  const bitmap = await createImageBitmap(file);

  let { width, height } = bitmap;
  if (width > height) {
    if (width > MAX_SIZE) {
      height = (height * MAX_SIZE) / width;
      width = MAX_SIZE;
    }
  } else {
    if (height > MAX_SIZE) {
      width = (width * MAX_SIZE) / height;
      height = MAX_SIZE;
    }
  }

  width = Math.round(width);
  height = Math.round(height);

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY });
  return blob;
}

self.onmessage = async (e) => {
  const { files } = e.data;
  const total = files.length;
  let batch = [];

  for (let i = 0; i < total; i++) {
    try {
      const blob = await generateThumbnail(files[i]);
      batch.push({ index: i, blob });
    } catch {
      // If thumbnail generation fails (corrupt image, etc.), send null
      batch.push({ index: i, blob: null });
    }

    // Flush batch when full or on last item
    if (batch.length >= BATCH_SIZE || i === total - 1) {
      self.postMessage({ type: 'batch', batch, progress: i + 1, total });
      batch = [];
    }
  }

  self.postMessage({ type: 'done', total });
};
