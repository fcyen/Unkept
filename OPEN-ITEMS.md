# PhotoStory — Open Items

High-priority discussion points that could affect the major implementation plan. Resolve before or alongside the phase they block.

---

## 1. HEIC Support Gap

**Blocks:** PR 1A (pipeline stages), upload flow design

iPhone users (primary target) shoot in HEIC by default. `exifr` can read EXIF from HEIC files, but browser canvas / OffscreenCanvas cannot decode HEIC for thumbnail generation in Chrome or Firefox — only Safari on Apple devices handles it natively.

**Decision needed:**
- Do we ship a WASM-based HEIC decoder (e.g. `libheif-js`) to handle this universally?
- Do we detect HEIC and show a clear error, asking the user to convert first?
- Do we rely on Safari-only support for now and accept that Chrome users on iPhone cannot use the app?

**Investigation required before PR 1A:** test HEIC upload end-to-end in Chrome on iOS and on desktop to confirm the exact failure mode.

---

## 2. Memory Pressure and Performance on Mobile

**Blocks:** PR 1C (thumbnail generation), overall pipeline strategy

The primary device is mobile. Two concerns:

- **Memory:** storing thumbnail data URLs as strings in RAM (~40KB × N photos) works on desktop but iOS Safari reclaims memory aggressively under pressure. 2,000 photos = ~80MB of thumbnail strings alone.
- **Performance:** Phase 1B (thumbnail generation, quality scoring) on a mid-range mobile browser without GPU acceleration could take several minutes, making the app feel broken.

**Decision needed:**
- What is the acceptable processing time ceiling for 500 photos on mobile?
- Should thumbnails be stored in IndexedDB rather than in-memory data URLs, trading speed for lower peak RAM?
- Should we target a lower thumbnail resolution on mobile (200px vs 400px) to cut memory use in half?

**Investigation required before PR 1C:** benchmark thumbnail generation and memory usage on a real mid-range iPhone (e.g. iPhone 12 or equivalent) with 200 and 500 photos.

---

## 3. Favourite Photo Metadata as Selection Signal — CLOSED

**Decision:** do not include in the data model.

iOS "Heart" and Google Photos star status are stored in each platform's database, not embedded in the photo file on export. The browser file picker only receives raw image bytes and standard EXIF — the favourite flag is inaccessible. The XMP `Rating` field (written by DSLRs and Lightroom) is readable via `exifr` but covers a minority professional workflow, not the primary iPhone user. Add only if it becomes a concrete user request.

---

## 4. Survey MVP Question — CLOSED

**Decision:** one question — "Which day was your favourite?" — multi-select of actual dates extracted from EXIF during Phase 1A. Optional and skippable. Hidden if only one date is found.

**Pipeline behaviour:** photos from the selected date(s) receive a boosted weight in heroSelect. That chapter is treated as the narrative anchor of the story.

**Why this question over the alternatives:**
- "What kind of trip was this?" — no algorithm can act on it in MVP; pure data collection
- "Who should appear most?" — requires face detection, which is post-MVP

**Post-MVP (PR 5A):** add free-text input ("the morning we hiked to the waterfall") interpreted by an LLM agent with tools to search chapters by date and location, returning structured selection weights. This is also the primary agent orchestration learning exercise.
