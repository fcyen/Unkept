# Unkept — Architecture

## Overview

Unkept is a privacy-first web app that turns a collection of photos into a Wrapped-style slideshow. EXIF extraction, deduplication, clustering, hero selection, chapter building, thumbnail generation, and blur scoring all run locally in the browser.

**Photos never leave the user's device during processing.** Data only leaves on explicit user action (future: Share, Generate Captions). The runtime splits into three parts: **Part 1 (Selection)** produces a serialisable **Story Skeleton** (JSON with embedded data-URL thumbnails and raw GPS coords); **Part 2 (Curation)** is an interactive review step where the user adjusts the kept set per chapter and emits a filtered skeleton; **Part 3 (Assets/Story)** consumes the curated skeleton and renders the slideshow, enriched with geocoded location labels.

> Note: the data-pipeline sections below predate the curation step and still label the offline selection pipeline "Phase 1" and the renderer "Phase 2" — these map to **Part 1** and **Part 3** respectively. Part 2 (Curation) sits between them and is documented in the components, not the pipeline.

Deployable as a static site.

---

## Directory Structure

```
/  (repo root)
├── ARCHITECTURE.md
├── IMPLEMENTATION-PLAN.md                # Current implementation plan
├── EXECUTIVE-SUMMARY.md                  # Product overview
├── MVP.md                                # MVP scope + quality bar
├── CLAUDE.md                             # Claude Code guide
├── client/                               # React + Vite + Tailwind (active)
│   ├── index.html
│   ├── vite.config.js
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   └── src/
│       ├── main.jsx
│       ├── App.jsx                       # Compat gate → Upload / Story / Dev routes
│       ├── index.css                     # Tailwind + slideshow keyframes
│       ├── lib/
│       │   ├── compatibility.js          # Web Workers / OffscreenCanvas / cores / memory gate
│       │   ├── usePipeline.js            # React hook over the orchestrator
│       │   ├── memoryManager.js          # Blob-URL / File-ref lifecycle tracker
│       │   ├── validateSkeleton.js       # Runtime shape validator
│       │   ├── geocode.js                # Nominatim + progressive updates (Part 3)
│       │   ├── storyBuilder.js           # Skeleton → render-ready Story (frames)
│       │   ├── pipeline/
│       │   │   ├── orchestrator.js       # Pure async Phase 1 orchestrator
│       │   │   ├── runner.js             # Stage chaining + skeleton assembly helpers
│       │   │   ├── strategies.js         # Registry of swappable strategies per stage
│       │   │   ├── concurrency.js        # `parallelMap` pool helper
│       │   │   └── stages/
│       │   │       ├── exif.js           # Wraps the EXIF Web Worker
│       │   │       ├── dedup.js          # Exact hash + perceptual hash dedup
│       │   │       ├── cluster.js        # Day-based clustering (swappable)
│       │   │       ├── heroSelect.js     # Hero picker (swappable)
│       │   │       ├── chapterBuilder.js # Selects photos + assembles chapters
│       │   │       ├── thumbnail.js      # 1000px hero + 200px standard JPEGs (single decode)
│       │   │       └── qualityScore.js   # Laplacian variance → 0–1 score
│       │   └── workers/
│       │       └── exif.worker.js        # EXIF extraction in a Web Worker
│       ├── components/
│       │   ├── CompatibilityBlock.jsx    # Rendered when compat gate fails
│       │   ├── UploadPage.jsx            # Upload UI + pipeline trigger
│       │   └── slideshow/                # PR 2B — Wrapped-style slideshow
│       │       ├── SlideshowPlayer.jsx
│       │       ├── CoverFrame.jsx
│       │       ├── ChapterDividerFrame.jsx
│       │       ├── PhotoCardFrame.jsx
│       │       ├── CodaFrame.jsx
│       │       ├── ProgressBar.jsx
│       │       ├── MusicToggle.jsx
│       │       └── music/                # Ambient pad synth + playback hook
│       └── dev/
│           ├── DevRoute.jsx              # `/dev` — fixture-driven design surface
│           └── fixtures.js
└── server/                               # Express stub (Phase 3, not in dev)
```

---

## Data Pipeline — Phase 1 (Selection)

All stages run locally in the browser. Stage contract: `(input, options, onProgress) => output`. Stages are pure and composable; `orchestrator.js` wires them together. Progress events flow up to `usePipeline` → React.

```
Files[] (user upload)
  │
  ▼
┌──────────────────────────────────────────────────────────────────┐
│  1. EXIF Extraction (Web Worker)                                 │
│     - exifr.parse → DateTimeOriginal; exifr.gps → lat/lng        │
│     - Worker isolates the library (keeps main thread responsive) │
│     Output: PhotoData[] with timestamp + coords                  │
└──────────────────────────┬───────────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│  2. Deduplication (parallelMap, concurrency 4)                   │
│     Pass 1 — Exact hash: first 64KB + last 64KB + file size.     │
│       Exact duplicates are dropped entirely.                     │
│     Pass 2 — Block-mean perceptual hash: 32×32 grayscale → 8×8   │
│       grid of 4×4 block means → 64-bit hash (bit i = mean[i] >   │
│       median). Hamming distance ≤ 10 ⇒ near-duplicate. Survivors │
│       are sorted by filename and each is compared only against   │
│       the last 5 kept reps (bursts are temporally local; cameras │
│       name files monotonically). Near-duplicates are kept as     │
│       `burstCandidates` for future live-photo rendering but are  │
│       not added to any chapter.                                  │
│     Output: { photos (representatives), burstGroups,             │
│               burstCandidates }                                  │
└──────────────────────────┬───────────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│  3. Clustering (swappable strategy, default "day")               │
│     Groups photos by calendar date. Timestamp-less photos land   │
│     in an "Undated" cluster. Burst data passes through unchanged.│
│     Output: PhotoData[][] (clusters) + burst metadata            │
└──────────────────────────┬───────────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│  4. Hero Selection (swappable strategy, default "middle")        │
│     Picks a hero photo per cluster. `heroSelectStage` accepts a  │
│     `highlightDates: []` option for survey-boosted selection;    │
│     the survey itself is dropped from MVP and we always pass []. │
│     Output: { clusters, heroIds: Set<string> }                   │
└──────────────────────────┬───────────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│  5. Chapter Builder                                              │
│     For each cluster: pick photos, assign heroPhotoId, compute   │
│     median coords + date. Burst candidates are added to the      │
│     photos map (so they get thumbnails) but not to chapter       │
│     photoIds — the renderer can consult `burstGroups` later.     │
│     Output: { chapters, photos: Map<id, PhotoData>, burstGroups }│
└──────────────────────────┬───────────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│  6. Thumbnail Generation (OffscreenCanvas, concurrency 4)        │
│     - Decode once → 1000px hero canvas; downscale to 200px       │
│       standard canvas. Encode both to JPEG data URLs.            │
│     - Hero tier feeds the slideshow renderer; standard tier is   │
│       used by debug surfaces and quality scoring.                │
│     - Inline Laplacian variance on the 200px canvas (the         │
│       qualityScore sigmoid is calibrated at that resolution);    │
│       stashed on `photo._rawVariance` for qualityScore to reuse  │
│     - HEIC: graceful degradation (`thumbnailFailed: true`)       │
│     Output: photos mutated with thumbnailUrl + thumbnailHeroUrl  │
└──────────────────────────┬───────────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│  7. Quality Score (concurrency 4, fast path is arithmetic)       │
│     Normalises `_rawVariance` to 0–1 via a sigmoid (center=200). │
│     Falls back to re-decoding the 200px thumbnail if the         │
│     pre-computed variance isn't present.                         │
│     Output: photos mutated with qualityScore                     │
└──────────────────────────┬───────────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│  Assemble Story Skeleton (`runner.assembleSkeleton`)             │
│     - Strip File references                                      │
│     - Revoke any remaining blob URLs                             │
│     - Serialise photos-by-id map, chapters with photoIds only,   │
│       burstGroups, and meta (dateRange, counts)                  │
│     Output: Story Skeleton JSON (fully serialisable)             │
└──────────────────────────┬───────────────────────────────────────┘
                           ▼
              Phase 1 done; hand to Phase 2
```

### Concurrency

Stages that were previously `for … await` now use `parallelMap` from `lib/pipeline/concurrency.js`, which runs up to 4 photos in flight at a time. dedup pass 1 (byte hash), dedup pass 2 (perceptual hash), thumbnail, and qualityScore all use this. The merge in dedup pass 2 runs sequentially over photos sorted by filename — for each photo we scan the last 5 kept reps for a hamming match, picking the closest one if any are within threshold.

See `IMPLEMENTATION-PLAN.md` → *Phase 1 performance notes* for open threads: worker hoist for thumbnail/dedup, combining dedup pass 2 with thumbnail decode (both decode each file today), and benchmarking the pool size.

---

## Data Pipeline — Phase 2 (Story)

```
Story Skeleton (JSON) + user intent to view
  │
  ▼
┌──────────────────────────────────────────────────────────────────┐
│  Geocoding (network, 1 req/s; Nominatim)                         │
│     - Round coords to 3 decimal places (~100m) and dedup per     │
│       chapter so we hit the rate limit less hard                 │
│     - Fills location/country labels + trip_name                  │
└──────────────────────────┬───────────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│  storyBuilder.js (Phase 2 data layer)                            │
│     - Picks photos per chapter (hero + next N-1 by qualityScore) │
│     - Chooses a PhotoCardFrame layout by orientation mix         │
│     - Assembles frames: cover → chapter dividers → photo cards → │
│       coda                                                       │
│     Output: Story (render-ready; frames, not blocks)             │
└──────────────────────────┬───────────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│  SlideshowPlayer.jsx                                             │
│     State machine: idle → playing → paused → finished            │
│     Auto-advances through frames; tap to pause / skip; bundled   │
│     ambient music (see `components/slideshow/music`).            │
└──────────────────────────────────────────────────────────────────┘
```

`UploadPage` drives Part 1 (the selection pipeline) via `usePipeline`, then calls `buildStory(skeleton)` → `resolveSkeletonLocations(skeleton)` → `applyGeocoding(story, …)` to produce a Story (which retains the source `skeleton`). `App.jsx` then routes through **Part 2 (Curation)**: `CurationScreen` lets the user adjust the kept set and emits the kept photo IDs. On completion, `App.jsx` filters `skeleton.chapters[].photoIds` to the kept set, replays `buildStory` + `applyGeocoding` (reusing the already-resolved locations, no second network round-trip), and hands the curated Story to `SlideshowPlayer` for **Part 3**. The slideshow consumes the skeleton-derived Story directly.

---

## Data Models

### PhotoData (in-pipeline, mutable)

Carried between stages. Has a live `file: File` reference until thumbnails are generated; stripped before serialisation. `_rawVariance` is a scratch field set by thumbnail, consumed and deleted by qualityScore.

```js
{
  id: "photo_0",
  name: "IMG_1234.jpg",
  file: File,                              // present only during Phase 1
  timestamp: "2025-03-15T08:30:00Z" | null,
  coords: { lat: 35.6762, lng: 139.6503 } | null,
  thumbnailUrl: "data:image/jpeg;base64,…" | null,        // 200px
  thumbnailHeroUrl: "data:image/jpeg;base64,…" | null,    // 1000px (slideshow)
  thumbnailFailed: false,
  qualityScore: 0.0–1.0 | null,
  faces: null,
  _rawVariance: number | null,             // scratch, removed by qualityScore
}
```

### Story Skeleton (Phase 1 output, serialisable)

```js
{
  version: "1.0",
  generatedAt: "2025-03-20T14:00:00Z",
  photos: {                                // photos-by-id map
    photo_0: { id, name, timestamp, coords, thumbnailUrl,
               thumbnailHeroUrl, thumbnailFailed, qualityScore, faces },
    …
  },
  chapters: [
    { id, photoIds: [...], heroPhotoId, date, coords },
    …
  ],
  burstGroups: [
    { representativeId, candidateIds: [...] },
    …
  ],
  meta: {
    totalPhotosInput: number,
    totalPhotosAfterDedup: number,
    totalChapters: number,
    dateRange: { start: "YYYY-MM-DD", end: "YYYY-MM-DD" } | null,
    surveyResponses: {},                   // kept for shape stability;
                                           // always {} now that the
                                           // MVP survey is dropped
  },
}
```

### Story (Phase 2 output — rendered directly by SlideshowPlayer)

Produced by `storyBuilder.js`. Shape is captured in that module and the slideshow components that consume it.

---

## Client-Server Boundary

### Always client-side
- EXIF extraction
- Deduplication, clustering, hero selection, chapter building
- Thumbnail generation + blur scoring
- Geocoding (network, but to Nominatim directly — no server proxy)
- All rendering

### Server-side (Phase 3 stub, not in active dev)
- Planned: Generate Captions, Share. Both would receive curated thumbnails (data URLs, ~20KB each) + metadata. Original full-res photos never leave the device.

---

## Key Design Decisions

| Decision | Rationale |
|---|---|
| Local-first processing | Photos never leave the device during processing; privacy by default |
| Compatibility gate | Blocks the app pre-pipeline if Workers / OffscreenCanvas / ≥4 cores / ≥4GB memory aren't present — no half-broken pipeline on unsupported devices |
| Story Skeleton as the hand-off | Phase 1 produces fully serialisable JSON with embedded data URLs; Phase 2 is a pure function of that JSON (modulo geocoding). Enables test fixtures, persistence, and a clean module boundary |
| Modular pipeline | Pure function stages, swappable strategies (via `strategies.js`), easy to extend |
| Day-based clustering (default) | Predictable chapters, natural narrative |
| Web Worker for EXIF only (today) | Keeps the `exifr` library off the main thread; hoisting thumbnail/dedup into a worker is an open perf thread |
| Bounded concurrency via `parallelMap` | Pool of 4 workers keeps the browser busy without thrashing memory with too many decoded bitmaps at once |
| Inline Laplacian variance | Thumbnail already has the pixel data; computing variance on the same canvas pass saves one decode per photo in qualityScore |
| Data-URL thumbnails | Serialisable into the skeleton; no blob-URL lifecycle to track after Phase 1 |
| Coordinate dedup for geocoding | 3 decimal places (~100m) collapses many chapters into ~15 Nominatim requests |
| No itinerary / no drag-and-drop | Removed with the MVP refocus; editorial UI is out of MVP scope |
| No open-source release | Project is private-learning-focused; do not suggest making public |

---

## Performance Targets

| Photos | Expected behavior |
|--------|-------------------|
| 100    | Near-instant processing |
| 500    | Smooth, progress bar visible |
| 2,000  | 10–20s processing, UI stays responsive |
| 5,000  | 30–60s processing, UI stays responsive |

April 2026 testing: the new pipeline (with dedup + blur scoring + two-pass hashing) does roughly 3× more work per photo than the pre-Phase 1 impl. Mitigations shipped: concurrency 4, inline variance, 400px tier disabled. See `IMPLEMENTATION-PLAN.md` → *Phase 1 performance notes* for the open threads.

---

## Browser Support

Chrome, Firefox, Safari 16.4+ (modern browsers only). The compatibility gate hard-blocks devices without Web Workers, OffscreenCanvas, ≥4 logical cores, or ≥4GB device memory (where reported).

---

## Dependencies

### Client
| Package | Purpose |
|---|---|
| react, react-dom | UI framework |
| exifr | EXIF metadata extraction (inside a Web Worker) |
| tailwindcss | Utility CSS |
| vite, @vitejs/plugin-react | Build tooling |
| vitest | Unit testing |

### Server (Phase 3 — stub)
| Package | Purpose |
|---|---|
| express | HTTP server |
| multer | File upload handling |
| exifr | Server-side EXIF extraction |
| cors | Cross-origin requests |
