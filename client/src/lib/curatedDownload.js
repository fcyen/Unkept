/**
 * Bundle the curated (kept) photos into a single ZIP and hand it to the
 * browser as a download. Everything runs locally — no network, no upload —
 * in keeping with Unkept's privacy-first design.
 *
 * Originals are streamed straight from their File handles (held by App for
 * the kept set's lifetime), so the exported archive is full-resolution. If
 * an original isn't available (e.g. dev fixtures), the ≤1000px hero
 * thumbnail is used as a fallback.
 */

import { createZip } from './zip.js';

function dataUrlToBytes(dataUrl) {
  const binary = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function sanitizeBase(name) {
  const base = (name || '').replace(/\.[^.]+$/, ''); // drop any extension
  const cleaned = base.replace(/[^a-zA-Z0-9-_]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned || 'photo';
}

function extensionFor(name, fallback = '.jpg') {
  const match = (name || '').match(/\.([a-zA-Z0-9]+)$/);
  return match ? `.${match[1].toLowerCase()}` : fallback;
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Build and download a ZIP of the kept photos. Reads the original File
 * bytes one at a time so peak memory stays close to a single image's
 * size, not the whole kept set decoded at once.
 *
 * @param {{ id: string, name?: string, thumbnailHeroUrl?: string, thumbnailUrl?: string }[]} photos
 * @param {string} [tripName] used to name the archive
 * @param {Map<string, File>} [originals] kept-id → File map (full-res source)
 * @returns {Promise<number>} count of photos written to the archive
 */
export async function downloadCuratedPhotos(photos, tripName, originals) {
  const entries = [];
  for (const photo of photos) {
    const prefix = String(entries.length + 1).padStart(2, '0');
    const original = originals?.get(photo.id);
    if (original) {
      const buf = await original.arrayBuffer();
      entries.push({
        name: `${prefix}-${sanitizeBase(photo.name || original.name)}${extensionFor(original.name)}`,
        data: new Uint8Array(buf),
      });
      continue;
    }
    const url = photo.thumbnailHeroUrl || photo.thumbnailUrl;
    if (!url) continue; // no original and no thumbnail — nothing to export
    entries.push({
      name: `${prefix}-${sanitizeBase(photo.name)}.jpg`,
      data: dataUrlToBytes(url),
    });
  }
  if (entries.length === 0) return 0;

  triggerDownload(createZip(entries), `${sanitizeBase(tripName) || 'unkept'}-photos.zip`);
  return entries.length;
}
