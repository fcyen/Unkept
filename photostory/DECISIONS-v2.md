# PhotoStory v2 — Design Decisions

This document records the key design decisions for the v2 refactor, including the reasoning behind each choice and the alternatives we considered.

---

## 1. Local-First Processing

**Decision:** All photo processing happens in the browser. Photos never leave the user's device during pipeline execution.

**Why:**
- Privacy is a hard requirement. Travel photos contain faces, locations, and personal moments. Users should not need to trust a server to process them.
- Eliminates upload latency entirely. Processing 5,000 photos locally is faster than uploading 5,000 photos over a typical home connection.
- Reduces infrastructure cost to zero for the processing path. The server only matters for optional features (captions, sharing).

**What this means in practice:**
- EXIF extraction, thumbnail generation, deduplication, clustering, and chapter building all run in Web Workers.
- The only network requests during processing are Nominatim geocoding calls, which send only rounded GPS coordinates (no photos, filenames, or user data).
- Data leaves the device only when the user explicitly clicks "Generate Captions" or "Share."

**Alternative considered:** Server-side processing with streaming upload. Rejected because it introduces a hard dependency on connectivity, adds upload time proportional to photo count, and creates a privacy surface area that requires trust infrastructure (encryption, access controls, deletion policies).

---

## 2. Explicit Data Boundary

**Decision:** Data only leaves the device on explicit user action ("Share" or "Generate Captions"), and only the minimal necessary payload is sent.

**Why:**
- Users should have full control over what gets shared. The pipeline processes everything locally; the user reviews the result; only the curated output can be sent externally.
- The server never receives original full-resolution photos. Only thumbnails (~20KB JPEG each) and chapter metadata are sent.
- This makes the privacy model auditable: the user can inspect the network tab and see exactly what leaves their browser.

**What gets sent (only on explicit action):**
- Thumbnails (small JPEGs, ~20KB each) of the final curated set
- Chapter metadata (titles, dates, locations)

**What never gets sent:**
- Original full-resolution photos
- Rejected duplicates or removed photos
- EXIF data beyond what's already in the chapter metadata
- Any data before the user explicitly triggers a server feature

---

## 3. Modular Pipeline with Swappable Strategies

**Decision:** The processing pipeline is a chain of pure functions, each with a defined input/output contract. Stages that have meaningful alternatives (clustering, hero selection) accept swappable strategies.

**Why:**
- Each stage can be developed, tested, and reviewed independently.
- New strategies (e.g., GPS-based clustering, quality-based hero selection) can be added by creating one file that exports a function with the same signature. No modifications to existing code required.
- The pipeline runner doesn't know what the stages do — it just chains them. This makes it trivial to reorder, skip, or add stages.

**What "swappable" means concretely:**
- `strategies.js` is a registry: `{ cluster: { day: dayClusterFn, timeGap: timeGapFn } }`.
- The pipeline config specifies which strategy to use: `{ cluster: { strategy: "day" } }`.
- The runner looks up the function and calls it. Adding a strategy = adding one file + one line in the registry.

**What is not swappable (intentionally):**
- EXIF extraction — there's one correct way to read EXIF.
- Thumbnail generation — always 400px JPEG.
- Chapter builder — always produces the same Chapter structure.

**Alternative considered:** A plugin architecture with lifecycle hooks. Rejected as over-engineered for the current scope. Pure functions with a simple registry provide the same extensibility with less abstraction.

---

## 4. Progressive Rendering

**Decision:** The UI never blocks on slow operations. Chapters render immediately after the chapter builder completes. Geocoded location labels fill in asynchronously.

**Why:**
- Geocoding is the slowest stage (network-bound, rate-limited to 1 req/sec). With 15 unique locations, it takes ~15 seconds. The user should not stare at a spinner for 15 seconds when the story is already fully formed.
- This matches user expectations from modern apps: content appears fast, details fill in progressively.

**How it works:**
- The pipeline runner returns chapters to the UI immediately after Stage 6 (chapter builder).
- Stage 7 (geocoding) runs in the background and calls an `onChapterUpdate` callback as each location resolves.
- The UI re-renders individual chapter titles from "Day 1" to "Day 1 — Asakusa" as results arrive.

**Implication for data model:**
- Chapter titles are stored, not computed. They start as "Day 1" and get updated to "Day 1 — Asakusa" when geocoding resolves.
- A `userRenamed` flag prevents geocoding from overwriting titles the user has manually edited.

---

## 5. Day-Based Clustering as Default

**Decision:** The default clustering strategy groups photos by calendar date. One day = one chapter.

**Why:**
- v1 used a 45-minute time gap heuristic, which produced too many small chapters for dense travel days (e.g., a walking tour of Tokyo could produce 8-10 chapters for a single day).
- Day-based clustering produces a natural narrative structure: "Day 1," "Day 2," etc. This maps to how people think about trips.
- For a 10-day trip with 5,000 photos, day-based clustering produces ~10 chapters — a manageable, readable story.

**Why this is swappable:**
- Some users may prefer finer granularity (time-gap clustering for a single-day event).
- Future features like itinerary matching need a different clustering strategy.
- The interface is simple: `(photos, options) => PhotoData[][]`. Any function with this signature can replace day-based clustering.

**Alternative considered:** Keeping the 45-minute gap as default. Rejected because it doesn't scale well to 5,000 photos and produces an unpredictable number of chapters. Day-based clustering is predictable: N days of photos = N chapters.

---

## 6. Block-Based Chapter Content

**Decision:** Each chapter contains an ordered array of typed content blocks (text blocks and photo blocks), rather than flat arrays of photos.

**Why:**
- The flat `photos[]` array in v1 couldn't represent mixed content (text interspersed with photos).
- The block model supports future editing: users can add text blocks between photo groups, reorder blocks, split a photos block into two groups with text in between.
- Every chapter starts with the same structure: one empty text block (shown as an editable placeholder) + one photos block (all that day's photos). This is simple to generate and immediately useful.

**Initial block structure (auto-generated):**
```js
blocks: [
  { type: "text", id: "blk_001", content: "" },           // editable placeholder
  { type: "photos", id: "blk_002", photos: PhotoData[] },  // all photos for this day
]
```

**Why not start with multiple photo blocks:** Splitting photos into multiple blocks requires editorial judgment (which photos go together?). That's a user decision, not something we should automate. One flat block per chapter is the honest default.

---

## 7. Client-Side Deduplication

**Decision:** Duplicate detection runs entirely in the browser using two complementary strategies: exact hash and perceptual hash.

**Why:**
- Users frequently upload the same photo twice (from different folders, devices, or cloud sync). Without dedup, a 2,000-photo set might contain 200+ duplicates that clutter the story.
- Exact hash (first 64KB + last 64KB + file size) catches identical files instantly without reading the full file.
- Perceptual hash (8x8 grayscale average hash) catches burst shots and near-identical photos with slightly different compression or crops.

**Why client-side:**
- Consistent with the local-first principle. No photos need to be uploaded for dedup.
- Both algorithms are fast enough for 5,000 photos in the browser. Exact hash is I/O-bound (reading 128KB per file). Perceptual hash is compute-bound (one 8x8 canvas resize per photo — trivial).

**Hamming threshold of 5:**
- A 64-bit perceptual hash allows distances 0-64. Threshold 5 means two images can differ in up to 5 of 64 bits and still be considered duplicates.
- Empirically, identical photos with different JPEG compression have distance 0-2. Burst shots (same scene, slight camera movement) have distance 2-5. Meaningfully different photos have distance 10+.
- Threshold 5 is conservative enough to avoid false positives while catching the majority of bursts.

**Alternative considered:** Server-side dedup with a proper image embedding model. Rejected for this phase — it would require uploading photos, which violates the local-first principle. Could be added as an optional enhancement later.

---

## 8. Web Workers for CPU-Intensive Work

**Decision:** EXIF extraction and thumbnail generation run in Web Workers to keep the main thread responsive.

**Why:**
- At 5,000 photos, EXIF extraction and thumbnail generation are the two most CPU-intensive stages. Running them on the main thread would freeze the UI for 30-60 seconds.
- Web Workers allow processing in batches of ~50 with progress reporting, keeping the UI responsive and the progress bar animated.
- `OffscreenCanvas` (available in Safari 16.4+) enables thumbnail generation inside a Worker without access to the DOM.

**Why batches of 50:**
- Small enough to report progress frequently (every 50 photos = 100 progress updates for 5,000 photos).
- Large enough to amortize the `postMessage` serialization overhead.
- Not a hard constraint — can be tuned based on profiling.

**Browser support:** Chrome, Firefox, Safari 16.4+. No fallbacks. This is a deliberate choice to avoid complexity. The target audience (users with 5,000 travel photos) is overwhelmingly on modern browsers.

---

## 9. Geocoding Optimization via Coordinate Deduplication

**Decision:** Round GPS coordinates to 3 decimal places and deduplicate before making Nominatim requests.

**Why:**
- 3 decimal places = ~100m precision. Photos taken at the same venue will have the same rounded coordinates.
- A 10-day trip with 50 chapters might have only 10-15 unique locations after rounding. This reduces geocoding time from 50+ seconds to ~15 seconds.
- Nominatim's rate limit is 1 request/second. Every avoided request saves 1 second of wall-clock time.

**Why 3 decimal places (not 4):**
- v1 used 4 decimal places (~10m precision). This was too fine — two photos taken 15 meters apart at the same temple would generate separate geocoding requests returning the same result.
- 3 decimal places (~100m) is sufficient for "what neighborhood/venue is this?" which is all we need for chapter titles.

**Cache strategy:** In-memory `Map<string, LocationResult>`. No persistence across sessions — geocoding is fast enough that re-running on the same photos takes ~15 seconds, which doesn't justify the complexity of IndexedDB caching.

---

## 10. Remove Itinerary Feature, Drag-and-Drop, and dnd-kit

**Decision:** Remove the itinerary upload UI, itinerary matching code, sample itinerary, and all `@dnd-kit` drag-reorder code.

**Why itinerary removal:**
- The itinerary feature was a v1 experiment. In practice, very few users have a structured JSON itinerary. Day-based clustering + geocoding produces better results for the common case.
- Itinerary matching can return as a future clustering strategy (`pipeline/stages/clusterByItinerary.js`) without the current UI complexity.
- Removing it simplifies the upload flow to a single action: select photos and click "Generate Story."

**Why dnd-kit removal:**
- Drag-to-reorder was brittle with the mixed editorial layouts (pair, single, asymmetric, trio). Reordering within a layout pattern often produced unexpected visual results.
- The block-based chapter model in v2 opens the door for better editing UX in the future (add/remove/reorder blocks). Retrofitting dnd-kit onto the new model would require a rewrite anyway.
- Removing 3 dependencies reduces bundle size and eliminates a class of bugs.

**What we keep:**
- The editorial layout rendering (pair, single, asymmetric, trio patterns). Only the drag-reorder interaction is removed.
- The `server/` directory — unchanged, needed for Phase 2.

---

## 11. No New Dependencies

**Decision:** The entire v2 refactor adds zero new npm dependencies.

**Why:**
- Web Workers, `OffscreenCanvas`, canvas-based hashing, and the `File` API are all built-in browser APIs.
- `exifr` (already a dependency) handles EXIF extraction inside the Worker.
- Nominatim is called via `fetch()`.
- The pipeline runner, strategy registry, and all processing stages are pure JavaScript.

**Net dependency change:** -3 packages (`@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`).

This keeps the bundle small, reduces supply chain risk, and means fewer things can break on upgrade.

---

## Summary Table

| # | Decision | Key Rationale |
|---|----------|---------------|
| 1 | Local-first processing | Privacy, no upload latency, zero infra cost |
| 2 | Explicit data boundary | User controls what leaves the device |
| 3 | Modular pipeline | Independent stages, swappable strategies, easy to extend |
| 4 | Progressive rendering | Don't block UI on geocoding |
| 5 | Day-based clustering | Predictable chapter count, natural narrative structure |
| 6 | Block-based chapters | Supports mixed content, future editing |
| 7 | Client-side dedup | Local-first, fast enough for 5K photos |
| 8 | Web Workers | Keep main thread responsive at scale |
| 9 | Coordinate deduplication | 3x-5x fewer geocoding requests |
| 10 | Remove itinerary + dnd-kit | Simplify UX, reduce bundle, better future path |
| 11 | No new dependencies | Browser APIs are sufficient |
