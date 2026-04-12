# PhotoStory — Open Items

High-priority discussion points that could affect the major implementation plan. Resolve before or alongside the phase they block.

---

## 1. HEIC Support Gap — CLOSED

**Decision:** graceful degradation in MVP; WASM decoder post-MVP if usage data justifies it.

EXIF extraction works for HEIC on all platforms (`exifr` parses binary structure directly). Thumbnail generation fails silently on Chrome/Firefox on desktop (Blink + Skia have no HEIC decoder). All iOS browsers are WebKit under the hood, so iPhone users are unaffected.

**MVP behaviour:**
- Attempt `createImageBitmap()` on each file during thumbnail generation
- Detect failure; skip thumbnail for that photo; continue the pipeline
- Show a small notice if any HEIC files failed: "X photos couldn't be previewed — open in Safari or share as JPEGs"
- Do not block the pipeline or show a hard error

**Post-MVP:** add `heic2any` (~2MB WASM) if analytics show desktop HEIC failures are a common pain point.

**Pre-PR 1A investigation:** confirm `createImageBitmap()` failure on a HEIC file is catchable (throws or returns detectable blank) — 30-minute test, not a blocker.

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
