# PhotoStory v2 — Implementation Plan

This document breaks the v2 implementation spec into four pull requests with clear scope, ordering, and acceptance criteria.

---

## Dependency Graph

```
PR 1  Pipeline Infrastructure + Web Workers
  │
  ├──► PR 2  Processing Stages (dedup, cluster, hero, chapter builder)
  │
  ├──► PR 3  Geocoding Stage + Progressive Updates
  │          (can be developed in parallel with PR 2)
  │
  └──► PR 4  Integration + Cleanup
              (requires PR 1 + PR 2 + PR 3)
```

---

## PR 1: Pipeline Infrastructure + Web Workers

**Branch:** `photostory-v2/pipeline-infra`

### Scope

Build the pipeline runner, strategy registry, and Web Workers for EXIF extraction and thumbnail generation. This is the foundation layer — every other PR depends on it.

### Files to create

| File | Purpose |
|------|---------|
| `client/src/lib/pipeline/runner.js` | Chains stages in order, emits progress events, accepts config |
| `client/src/lib/pipeline/strategies.js` | Registry mapping stage names to strategy implementations |
| `client/src/lib/workers/exif.worker.js` | EXIF extraction via `exifr` in a Web Worker, batches of 50 |
| `client/src/lib/workers/thumbnail.worker.js` | `OffscreenCanvas` thumbnail generation in a Web Worker |

### Files to modify

| File | Change |
|------|--------|
| `client/vite.config.js` | Ensure Vite handles `?worker` imports correctly (may already work by default) |

### Key details

- **Pipeline runner** accepts an ordered list of stage functions and a config object. It calls each stage sequentially, passing the output of one as the input to the next. It emits `{ stage, progress, total }` events via a callback so the UI can render a progress bar.
- **EXIF worker** receives `File` objects via `postMessage`, runs `exifr.parse()` and `exifr.gps()`, and posts back metadata arrays per batch. `URL.createObjectURL()` must be called on the main thread (not in the worker).
- **Thumbnail worker** uses `OffscreenCanvas` to resize to 400px max dimension, exports as JPEG blob. Main thread creates `thumbnailUrl` from the returned blob.
- **Strategy registry** is a simple object map: `{ dedup: { exact: dedupFn }, cluster: { day: clusterFn }, heroSelect: { middle: heroFn } }`. Adding a strategy = adding one file + one line in the registry.

### Acceptance criteria

- [ ] `runner.js` can chain 2+ stages and report progress
- [ ] EXIF worker extracts timestamp + GPS from test photos
- [ ] Thumbnail worker produces 400px JPEG blobs
- [ ] Workers process in batches with progress callbacks
- [ ] No UI changes — existing flow still works

---

## PR 2: Processing Stages

**Branch:** `photostory-v2/processing-stages`
**Depends on:** PR 1

### Scope

Implement the four pure processing stages: deduplication, day-based clustering, hero selection, and chapter building.

### Files to create

| File | Purpose |
|------|---------|
| `client/src/lib/pipeline/stages/dedup.js` | Exact hash + perceptual hash deduplication |
| `client/src/lib/pipeline/stages/cluster.js` | Day-based clustering (swappable strategy) |
| `client/src/lib/pipeline/stages/heroSelect.js` | Hero photo picker (swappable strategy) |
| `client/src/lib/pipeline/stages/chapterBuilder.js` | Assembles Chapter objects with block structure |

### Files to modify

| File | Change |
|------|--------|
| `client/src/lib/pipeline/strategies.js` | Register all new strategies |

### Key details

**Dedup stage:**
- Exact hash: read first 64KB + last 64KB + file size as fingerprint. Fast, catches identical re-uploads.
- Perceptual hash: resize to 8x8 grayscale on canvas, compute average brightness, generate 64-bit hash. Hamming distance threshold <= 5 catches bursts and near-identical shots.
- Both run sequentially. Output is deduplicated `PhotoData[]`.

**Cluster stage:**
- Default "day" strategy: sort by timestamp, group by calendar date (`YYYY-MM-DD`).
- Photos with no timestamp go into an "Undated" chapter.
- Interface: `(photos, options) => PhotoData[][]` (array of groups).
- Swappable — future strategies (time-gap, GPS, itinerary) export the same signature.

**Hero selection stage:**
- Default "middle" strategy: sort group by timestamp, pick the middle photo.
- Interface: `(photos) => PhotoData`.

**Chapter builder stage:**
- Assigns `dayIndex` (0-based) by chronological order of dates.
- Generates initial title as `"Day {dayIndex + 1}"`.
- Computes `location.coords` as median GPS of all photos in the chapter (or null).
- Creates two blocks per chapter: one empty text block + one photos block.
- Sets `heroPhoto` from hero selection output.

### Acceptance criteria

- [ ] Exact dedup removes identical files
- [ ] Perceptual dedup removes near-identical burst shots (hamming <= 5)
- [ ] Day clustering groups photos correctly by calendar date
- [ ] Undated photos land in a separate group
- [ ] Hero selection picks the chronological middle photo
- [ ] Chapter builder produces Chapter objects matching the v2 data model
- [ ] Each chapter has exactly two blocks: text (empty) + photos
- [ ] All stages are registered in `strategies.js`

---

## PR 3: Geocoding Stage + Progressive Updates

**Branch:** `photostory-v2/geocoding`
**Depends on:** PR 1 (can be developed in parallel with PR 2)

### Scope

Build the new geocoding pipeline stage that replaces `lib/geocode.js` with optimized batching, deduplication, and progressive chapter updates.

### Files to create

| File | Purpose |
|------|---------|
| `client/src/lib/pipeline/stages/geocode.js` | Nominatim geocoding with caching + progressive updates |

### Files to modify

| File | Change |
|------|--------|
| `client/src/lib/pipeline/strategies.js` | Register geocode stage |

### Key details

**Optimization strategy:**
1. Round all GPS coords to 3 decimal places (~100m precision) — current code uses 4.
2. Deduplicate: group chapters by rounded coords. For a typical trip, this collapses 50+ chapters to 10-15 unique locations.
3. Cache results in a `Map<string, LocationResult>` keyed by `"lat,lng"` (rounded).
4. Fetch unique locations from Nominatim at 1 req/sec.
5. As each result arrives, update the chapter's `location.label`, `location.country`, and `title`.

**Title update rules:**
- If GPS data exists and geocoding resolves: `"Day {dayIndex + 1} — {location.label}"`.
- If no GPS data: `"Day {dayIndex + 1}"`.
- A `userRenamed` flag on the chapter prevents geocoding from overwriting manual titles.

**Trip name generation:**
- Collect all unique countries from geocoded chapters.
- Format: `"{countries}, {month} {year}"` using the date range of all photos.
- Example: `"Japan, March 2025"` or `"Japan & Thailand, March 2025"`.

**Privacy:** Only rounded GPS coordinates are sent to Nominatim. No photos, filenames, timestamps, or user identifiers.

**Progressive rendering contract:** This stage accepts a callback `onChapterUpdate(chapterId, updates)` so the UI can re-render individual chapters as geocoding results arrive, rather than waiting for all locations to resolve.

### Acceptance criteria

- [ ] Coords rounded to 3 decimal places
- [ ] Chapters with the same rounded coords share a single Nominatim request
- [ ] Results are cached — repeat calls for the same coords don't hit the network
- [ ] Rate limited to 1 req/sec
- [ ] Chapters update progressively as results arrive
- [ ] Title updates from "Day 1" to "Day 1 — Asakusa" on geocode resolve
- [ ] User-renamed titles are not overwritten
- [ ] Trip name auto-generated from countries + date range

---

## PR 4: Integration + Cleanup

**Branch:** `photostory-v2/integration`
**Depends on:** PR 1 + PR 2 + PR 3

### Scope

Wire the pipeline into the UI, update components for the new data model, and remove all deprecated code.

### Files to modify

| File | Change |
|------|--------|
| `client/src/components/UploadPage.jsx` | Replace manual `exif → thumbnails → matcher → geocode` calls with single `runner.run()` call. Remove itinerary mode selector, sample itinerary constant, and JSON textarea. |
| `client/src/components/StoryView.jsx` | Adapt to new Chapter shape (blocks, new title format). Support progressive geocoding updates. |
| `client/src/components/Chapter.jsx` | Render block-based content (text block + photos block) instead of flat photo array. Use new title/location fields. |
| `client/src/components/EditablePhotoLayout.jsx` | Remove all `@dnd-kit` drag-reorder code. Keep the layout pattern rendering (pair, single, asymmetric, trio). |
| `client/package.json` | Remove `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`. |

### Files to delete

| File | Reason |
|------|--------|
| `client/src/lib/geocode.js` | Replaced by `pipeline/stages/geocode.js` |
| `client/src/lib/matcher.js` | Replaced by `pipeline/stages/cluster.js` + `chapterBuilder.js` |
| `sample/itinerary.json` | Itinerary feature removed |

### What stays untouched

- `server/` — entire directory unchanged (needed for Phase 2)
- `client/src/lib/exif.js` — can be kept as fallback or removed (worker replaces it)
- `client/src/lib/thumbnails.js` — can be kept as fallback or removed (worker replaces it)
- `FadeIn.jsx`, `TableOfContents.jsx` — no changes needed
- `index.css`, `tailwind.config.js` — no changes needed

### Acceptance criteria

- [ ] "Generate Story" button triggers the pipeline runner
- [ ] Progress bar reflects pipeline stage progress
- [ ] Chapters render immediately after chapter builder completes
- [ ] Location labels fill in asynchronously as geocoding resolves
- [ ] No itinerary UI anywhere
- [ ] No drag-reorder functionality
- [ ] `@dnd-kit` packages removed from `package.json` and `node_modules`
- [ ] `matcher.js`, `geocode.js`, `sample/itinerary.json` deleted
- [ ] App works end-to-end with 100+ photos

---

## Risk Areas

| Risk | Mitigation |
|------|------------|
| `OffscreenCanvas` not available in older Safari | Browser target is Safari 16.4+ which supports it. No fallback needed. |
| Perceptual hashing is slow for 5,000 photos | Hash computation uses tiny 8x8 canvas — fast even at scale. Batch processing prevents UI freezes. |
| Nominatim rate limiting (1 req/sec) | Coord deduplication reduces 50+ chapters to ~10-15 requests. Total geocoding time ~15s worst case. |
| Web Worker `postMessage` overhead for large File objects | Workers receive File objects (lightweight handles, not full data). Actual file reads happen inside the worker. |

---

## Testing Strategy

Each PR should be manually testable:

- **PR 1:** Import runner + workers in a scratch script, process a handful of test photos, verify metadata + thumbnails.
- **PR 2:** Unit-test each stage function with mock `PhotoData[]` input. Verify dedup removes known duplicates, clustering groups by date, etc.
- **PR 3:** Test with chapters that have GPS data. Verify deduplication, caching, and progressive updates. Mock Nominatim for fast tests.
- **PR 4:** Full end-to-end test. Upload 100+ photos, verify story renders correctly with progressive location labels.
