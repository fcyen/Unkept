/**
 * Build the DEMO_MODE fixture (public/demo/pipeline-fixture.json) from a
 * finished /pipeline run. One code path for both producers:
 *   - the "Export demo fixture" button in live /pipeline (your own browser —
 *     the one whose JPEG bytes match your score cache), and
 *   - scripts/build-demo-fixture.mjs (headless Chromium), which calls
 *     window.__exportDemoFixture() on the same page.
 *
 * Publishing hygiene: GPS rounded to ~1 km, the pipeline's own thumbnail data
 * URLs dropped (the `images` map covers every photo at 320px), and model
 * results stripped entirely when no score came from the cache.
 */

const round2 = (n) => Math.round(n * 100) / 100;

/** Count cached hits and not_cached misses across every model slot. */
export function countCacheResults(aestheticSnap) {
  let hits = 0;
  let misses = 0;
  for (const p of Object.values(aestheticSnap?.perPhoto ?? {})) {
    for (const m of p.models ?? []) {
      if (m?.score != null) hits++;
      else if (m?.error?.kind === 'not_cached') misses++;
    }
  }
  return { hits, misses };
}

/**
 * @param {{ snapshots: object, images: Record<string,string>, generator: string, now?: Date }} args
 */
export function buildDemoFixture({ snapshots: input, images, generator, now = new Date() }) {
  const snapshots = JSON.parse(JSON.stringify(input));

  for (const p of Object.values(snapshots.exif?.perPhoto ?? {})) {
    if (p.coords) p.coords = { lat: round2(p.coords.lat), lng: round2(p.coords.lng) };
  }
  for (const p of Object.values(snapshots.thumbnail?.perPhoto ?? {})) p.thumbnailUrl = null;
  for (const p of Object.values(snapshots.dedup?.perPhoto ?? {})) {
    // Keep the 8×8 hash tiles (tiny); nothing else here holds image data.
    if (p.dHashThumbnailUrl && p.dHashThumbnailUrl.length > 4000) p.dHashThumbnailUrl = null;
  }

  const a = snapshots.aestheticScore;
  const { hits, misses } = countCacheResults(a);
  const models = hits > 0 ? (a?.modelLabels ?? []) : [];
  if (a && hits === 0) {
    a.status = 'not_bundled';
    a.modelLabels = [];
    for (const p of Object.values(a.perPhoto)) { p.models = null; p.error = null; }
  }

  const generatedAt = now.toISOString();
  return {
    meta: {
      version: generatedAt.slice(0, 19).replace(/\D/g, ''),
      generatedAt,
      photoCount: snapshots.exif?.count ?? 0,
      models,
      source: {
        generator,
        cacheHits: hits,
        cacheMisses: misses,
        semanticClustering: (snapshots.embedding?.embeddedCount ?? 0) > 0,
      },
      note: 'Model scores come only from the proxy score cache; no model API was called to build this file.',
    },
    images,
    snapshots,
  };
}

/** Browser only: a 320px JPEG data URL for every sample photo, keyed by photo id. */
export async function buildDisplayImages(sampleUrls, snapshots) {
  const byName = Object.fromEntries(
    Object.entries(snapshots.exif?.perPhoto ?? {}).map(([id, p]) => [p.name, id]),
  );
  const images = {};
  for (const u of sampleUrls) {
    const id = byName[decodeURIComponent(u.split('/').pop())];
    if (!id) continue;
    const blob = await (await fetch(u)).blob();
    const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
    const scale = 320 / Math.max(bmp.width, bmp.height);
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close();
    images[id] = c.toDataURL('image/jpeg', 0.74);
  }
  return images;
}
