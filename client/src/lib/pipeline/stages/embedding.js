/**
 * Embedding Stage — CLIP ViT-B/32 via local server
 *
 * Pipeline stage signature:
 *   ({ photos, burstGroups, burstCandidates }, options, onProgress)
 *     => { photos, burstGroups, burstCandidates }
 *
 * Sends each photo as a 224px JPEG to the local embedding server and adds
 * an `embedding` field (Float32Array, 512 dims, L2-normalised) to each
 * photo. Photos that fail to encode are marked with embedding: null so the
 * cluster stage can fall back gracefully.
 *
 * If the server is unreachable, all embeddings are null and the stage warns
 * to the console — the pipeline continues with time-based clustering.
 *
 * Server must be running at http://localhost:8000 (see docs/ai-embedding-server.md).
 */

import { parallelMap, DEFAULT_STAGE_CONCURRENCY } from '../concurrency.js';

const EMBED_SERVER = 'http://localhost:8000';
const CLIP_SIZE = 224;   // CLIP ViT-B/32 input resolution
const BATCH_SIZE = 16;   // images per HTTP request to the server

/**
 * Decode a File to a 224×224 JPEG data URL for CLIP input.
 */
async function fileToClipDataUrl(file) {
  const bitmap = await createImageBitmap(file);
  const canvas = new OffscreenCanvas(CLIP_SIZE, CLIP_SIZE);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, CLIP_SIZE, CLIP_SIZE);
  bitmap.close();

  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return 'data:image/jpeg;base64,' + btoa(binary);
}

/**
 * POST a batch of {id, data} items to /embed and return {id -> Float32Array}.
 */
async function fetchEmbeddings(batch) {
  const response = await fetch(`${EMBED_SERVER}/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ images: batch }),
  });
  if (!response.ok) throw new Error(`Embed server error: ${response.status}`);
  const { embeddings } = await response.json();
  const map = new Map();
  for (const { id, vector } of embeddings) {
    map.set(id, new Float32Array(vector));
  }
  return map;
}

/**
 * @param {{ photos: PhotoData[], burstGroups: BurstGroup[], burstCandidates: PhotoData[] }} input
 * @param {{ serverUrl?: string }} options
 * @param {(done: number, total: number) => void} onProgress
 */
export async function embeddingStage(input, options = {}, onProgress) {
  const photos = input.photos ?? [];
  const total = photos.length;

  if (total === 0) return input;

  // Check server is reachable before doing any work.
  try {
    const probe = await fetch(`${EMBED_SERVER}/health`, { signal: AbortSignal.timeout(2000) });
    if (!probe.ok) throw new Error('unhealthy');
  } catch {
    console.warn(
      '[embeddingStage] Embedding server unreachable at', EMBED_SERVER,
      '— skipping embeddings. Start the server to enable semantic clustering.',
    );
    for (const photo of photos) photo.embedding = null;
    if (onProgress) onProgress(total, total);
    return input;
  }

  // Encode all photos to 224px JPEG data URLs (parallelised).
  let encoded = 0;
  const dataUrls = await parallelMap(
    photos,
    DEFAULT_STAGE_CONCURRENCY,
    async (photo) => {
      try {
        return await fileToClipDataUrl(photo.file);
      } catch {
        return null; // HEIC or corrupt — will get null embedding
      }
    },
    () => {
      encoded++;
      if (onProgress) onProgress(Math.round((encoded / total) * 0.5 * total), total);
    },
  );

  // Send to server in batches.
  const batches = [];
  for (let i = 0; i < photos.length; i += BATCH_SIZE) {
    const slice = photos.slice(i, i + BATCH_SIZE);
    const items = slice
      .map((p, j) => dataUrls[i + j] ? { id: p.id, data: dataUrls[i + j] } : null)
      .filter(Boolean);
    batches.push({ slice, items, offset: i });
  }

  let fetched = 0;
  for (const { slice, items, offset } of batches) {
    let embMap = new Map();
    if (items.length > 0) {
      try {
        embMap = await fetchEmbeddings(items);
      } catch (err) {
        console.warn('[embeddingStage] Batch failed:', err.message);
      }
    }
    for (let j = 0; j < slice.length; j++) {
      slice[j].embedding = embMap.get(slice[j].id) ?? null;
    }
    fetched += slice.length;
    if (onProgress) onProgress(Math.round(total * 0.5 + (fetched / total) * 0.5 * total), total);
  }

  if (onProgress) onProgress(total, total);
  return input;
}
