/**
 * Bundle the curated (kept) photos into a single ZIP and hand it to the
 * browser as a download. Everything runs locally — no network, no upload —
 * in keeping with Unkept's privacy-first design.
 *
 * The best image available at curation time is the 1000px hero thumbnail
 * (`thumbnailHeroUrl`); the original full-resolution File bytes are revoked
 * earlier in the pipeline, so they cannot be re-exported here.
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
 * Build and download a ZIP of the kept photos.
 *
 * @param {{ id: string, name?: string, thumbnailHeroUrl?: string, thumbnailUrl?: string }[]} photos
 * @param {string} [tripName] used to name the archive
 * @returns {number} count of photos written to the archive
 */
export function downloadCuratedPhotos(photos, tripName) {
  const entries = [];
  for (const photo of photos) {
    const url = photo.thumbnailHeroUrl || photo.thumbnailUrl;
    if (!url) continue; // thumbnail failed to decode upstream — nothing to export
    const prefix = String(entries.length + 1).padStart(2, '0');
    entries.push({
      name: `${prefix}-${sanitizeBase(photo.name)}.jpg`,
      data: dataUrlToBytes(url),
    });
  }
  if (entries.length === 0) return 0;

  triggerDownload(createZip(entries), `${sanitizeBase(tripName) || 'unkept'}-photos.zip`);
  return entries.length;
}
