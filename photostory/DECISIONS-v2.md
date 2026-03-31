# PhotoStory v2 — Design Decisions

Key design decisions for the v2 refactor, with rationale and alternatives considered.

---

## 1. Local-First Processing

All photo processing (EXIF, thumbnails, dedup, clustering, chapter building) happens in the browser. Photos never leave the device during processing.

- **Why:** Privacy by default — travel photos contain faces, locations, personal moments. Eliminates upload latency. Zero infrastructure cost for the processing path.
- **Data leaves only on explicit action:** "Generate Captions" sends curated thumbnails (~20KB each) + metadata. "Share" uploads the final story. Original photos are never sent.
- **Rejected alternative:** Server-side processing with streaming upload — adds connectivity dependency, upload latency, and trust infrastructure requirements.

---

## 2. Modular Pipeline with Swappable Strategies

The pipeline is a chain of pure functions. Stages with meaningful alternatives (clustering, hero selection) are swappable via a strategy registry.

- **Why:** Each stage is independently testable. New strategies = one new file + one registry line. The runner just chains functions — doesn't know what they do.
- **Swappable:** clustering (day, time-gap, GPS, itinerary), hero selection (middle, random, quality).
- **Not swappable:** EXIF extraction, thumbnail gen, chapter builder — one correct implementation each.
- **Rejected alternative:** Plugin architecture with lifecycle hooks — over-engineered for current scope.

---

## 3. Progressive Rendering

Chapters render immediately after the chapter builder. Geocoding fills in location labels asynchronously.

- **Why:** Geocoding is rate-limited to 1 req/sec. With 15 unique locations, that's ~15 seconds. Users shouldn't wait for location labels when the story is already complete.
- **How:** Chapter titles start as "Day 1", update to "Day 1 — Asakusa" as geocoding resolves. A `userRenamed` flag prevents overwriting manual edits.

---

## 4. Day-Based Clustering (Replacing 45-min Gap)

Default clustering groups photos by calendar date. One day = one chapter.

- **Why:** v1's 45-minute gap produced too many chapters on dense travel days (8-10 for a walking tour). Day-based is predictable: N days = N chapters, mapping to how people think about trips.
- **Swappable:** Time-gap, GPS-based, and itinerary clustering can be added as separate strategy files with the same `(photos, options) => PhotoData[][]` interface.

---

## 5. Block-Based Chapter Content

Chapters contain an ordered array of typed blocks (`text` + `photos`) instead of a flat photo array.

- **Why:** Supports mixed content and future editing (add text between photo groups, reorder blocks). Every chapter starts with one empty text block + one photos block — simple to generate, immediately useful.

---

## 6. Client-Side Deduplication (Exact + Perceptual Hash)

Two strategies: exact hash (first 64KB + last 64KB + file size) for identical files, perceptual hash (8x8 grayscale, hamming distance ≤ 5) for burst shots.

- **Why:** Users commonly upload duplicates from multiple folders/devices. Both algorithms are fast enough for 5,000 photos in the browser — no upload needed.
- **Hamming threshold 5:** Identical JPEGs with different compression = distance 0-2. Burst shots = 2-5. Meaningfully different = 10+. Threshold 5 avoids false positives while catching most bursts.

---

## 7. Web Workers + No New Dependencies

EXIF and thumbnail generation run in Web Workers (batches of ~50). The entire v2 adds zero npm dependencies; net change is -3 (`@dnd-kit/*` removed).

- **Why Workers:** At 5,000 photos, main-thread processing would freeze the UI for 30-60 seconds.
- **Why no deps:** Web Workers, OffscreenCanvas, canvas hashing, and File API are all built-in. Keeps bundle small and supply chain minimal.
- **Browser target:** Chrome, Firefox, Safari 16.4+. No fallbacks — deliberate simplicity.

---

## 8. Remove Itinerary Feature + dnd-kit

Remove itinerary upload UI, matching code, sample itinerary, and all drag-reorder code.

- **Why itinerary:** Few users have structured JSON itineraries. Day clustering + geocoding covers the common case. Can return as a clustering strategy later.
- **Why dnd-kit:** Drag-reorder was brittle with mixed editorial layouts. The block-based model enables better editing UX in the future. -3 dependencies.
- **Keep:** Editorial layout rendering (pair, single, asymmetric, trio). Server directory (Phase 2).
