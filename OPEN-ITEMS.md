# Unkept — Open Items

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

## 2. Memory Pressure and Performance on Mobile — CLOSED

**Decision:** inverted pipeline order + two-tier thumbnails resolves both concerns.

**Root cause fix — invert the pipeline:**
Generate thumbnails *after* chapter builder has selected which photos appear in the story, not before. This means thumbnails are only generated for selected photos (~120 for a typical 500-photo trip), not all photos.

**Two thumbnail tiers:**
- **Ephemeral 16px micro-canvas** (perceptual hash only) — computed in worker, discarded immediately, never stored
- **200px JPEG** — all selected photos; serves quality scoring, all planned ML models (NIMA/face/CLIP all work on 200px input), and mobile rendering
- **400px JPEG** — hero photos on desktop only (large featured image per chapter)

**Estimated RAM at steady state:** ~1.7MB for a typical trip — memory is no longer a concern.

**No IndexedDB in MVP** — not needed with this approach.

**Remaining investigation (pre-PR 1C, not a blocker):** benchmark `createImageBitmap()` throughput on a mid-range iPhone for ~120 files at 200px to confirm processing time is acceptable (~5s target).

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

---

## 5. Product Telemetry — CLOSED

**Decision:** use PostHog for v1 product analytics, behind a small wrapper so we can migrate to owned telemetry later.

**Events:** `story_intent_selected`, `story_started`, `story_completed`, `story_exited`, `story_replayed`.

**Payload:** `storyRunId` (`run_<uuid>`), `storyIntent`, `photoCount`, and playback fields (`totalFrames`, `reachedFrameIndex`, `completionRate`, `replayCount`). Do not send filenames, dates, GPS, thumbnails, photo IDs, or skeletons.
