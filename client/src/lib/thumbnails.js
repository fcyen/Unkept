/**
 * Generate a thumbnail for a File object using canvas.
 * Returns a blob URL for the thumbnail.
 */
export function generateThumbnail(file, maxSize = 400) {
  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;

      if (width > height) {
        if (width > maxSize) {
          height = (height * maxSize) / width;
          width = maxSize;
        }
      } else {
        if (height > maxSize) {
          width = (width * maxSize) / height;
          height = maxSize;
        }
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(objectUrl);
          if (blob) {
            resolve(URL.createObjectURL(blob));
          } else {
            resolve(null);
          }
        },
        'image/jpeg',
        0.7
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(null);
    };

    img.src = objectUrl;
  });
}

/**
 * Generate thumbnails for an array of photo objects (from extractBatch).
 * Mutates the objects in place, setting thumbnailUrl.
 */
export async function generateThumbnails(photos, onProgress) {
  for (let i = 0; i < photos.length; i++) {
    photos[i].thumbnailUrl = await generateThumbnail(photos[i].file);
    if (onProgress) {
      onProgress(i + 1, photos.length);
    }
  }
  return photos;
}
