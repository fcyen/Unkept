# PhotoStory — Implementation Plan

This plan reflects the revised architecture from the system design review (April 2026). For MVP feature scope and quality bar, see `MVP.md`.

---

## Core Architecture Decisions (from design review)

| Decision | Detail |
|---|---|
| Two-part separation | Part 1 (Selection) is 100% offline, pure computation. Part 2 (Story) handles rendering + enrichment. |
| Part 1 output | Serialisable Story JSON — embedded thumbnail data URLs, raw GPS coords, no geocoded labels |
| Geocoding lives in Part 2 | Nominatim is a network call; turns raw coords into labels at render time, not selection time |
| Two-phase pipeline | Phase 1A (cheap: EXIF, dedup, basic cluster) runs first; survey collects user preferences during this time; Phase 1B (expensive: ML scoring, hero select) runs after, informed by survey |
| Memory management | Revoke blob URLs eagerly after each stage; track lifecycle explicitly |
| PWA manifest now | Service worker deferred until first ML model is added |
| Compatibility gate | Check before any processing; block low-end devices |
| Mode indicator | "Local mode" / "Server mode" badge; one-time boundary notification on first server transition |

---

## Data Model (revised)

### Part 1 Output — Story Skeleton (serialisable)

```js
// Everything here must be JSON-serialisable (no File objects, no blob URLs)
{
  version: "1.0",
  generatedAt: "2025-03-20T14:00:00Z",
  photos: {
    "photo_0": {
      id: "photo_0",
      name: "IMG_1234.jpg",
      timestamp: "2025-03-15T08:30:00Z",  // from EXIF, or null
      coords: { lat: 35.6762, lng: 139.6503 },  // raw EXIF GPS, or null
      thumbnailDataUrl: "data:image/jpeg;base64,...",  // 400px, embedded
      qualityScore: 0.82,    // 0–1, from ML scoring (null until ML added)
      faces: 2,              // face count (null until face detection added)
    },
    ...
  },
  chapters: [
    {
      id: "chapter_001",
      photoIds: ["photo_5", "photo_2", "photo_8"],  // selection, ordered
      heroPhotoId: "photo_5",
      date: "2025-03-15",
      coords: { lat: 35.714, lng: 139.797 },  // median GPS of chapter, or null
      // No title, no location label — those are Part 2 responsibilities
    },
    ...
  ],
  meta: {
    totalPhotosInput: 847,
    totalPhotosAfterDedup: 612,
    totalChapters: 6,
    dateRange: { start: "2025-03-15", end: "2025-03-20" },
    surveyResponses: {  // stored for reproducibility and ML feedback
      tripType: "leisure",
      highlightDays: ["2025-03-17"],
      keyPeople: ["person_cluster_2"],
    },
  }
}
```

### Part 2 — Story (render-time, not serialised)

```js
{
  skeleton: StorySkeleton,     // the Part 1 output
  trip_name: "Japan, March 2025",  // generated from geocoding + date range
  chapters: [
    {
      ...skeletonChapter,
      title: "Day 1 — Asakusa",  // generated; overridable by user
      userRenamed: false,
      location: {
        label: "Asakusa, Tokyo",
        country: "Japan",
      },
      blocks: [
        { type: "text", id: "blk_001", content: "" },
        { type: "photos", id: "blk_002", photoIds: [...] },
      ],
    },
    ...
  ],
}
```

---

## Pipeline Design (revised)

### Phase 1A — Cheap stages (run immediately, survey shown during this)

```
File[] input
  │
  ▼ [EXIF Extraction — Web Worker, batches of 50]
  │   Output: PhotoData[] with timestamps + raw GPS
  │   Blob URLs: created on main thread after worker returns
  │   Memory note: File objects are lightweight handles; EXIF worker
  │                reads bytes on demand, does not copy full image to RAM
  │
  ▼ [Deduplication — exact hash + perceptual hash]
  │   Output: deduplicated PhotoData[]
  │   Memory: blob URLs for rejected duplicates are REVOKED here
  │
  ▼ [Basic Clustering — day-based or time-gap]
  │   Output: PhotoData[][] (grouped, ordered by date)
  │   No network, no ML, no heavy computation
  │
  └──► Phase 1A complete → emit checkpoint event
       → UI: survey has collected responses by now (or timeout)
       → Resume Phase 1B with survey config
```

### Survey (parallel to Phase 1A)

The survey is not a pipeline stage — it runs concurrently in the UI while Phase 1A processes.

```
UI thread (while Phase 1A runs in worker):
  → Show 2–3 short questions:
      "What kind of trip was this?"    [Leisure / Family / Adventure / Work]
      "Any days that were special?"    [multi-select from dates found in EXIF]
      "Who should appear most?"        [placeholder for future face selection]
  → Collect responses into SurveyConfig object
  → On Phase 1A checkpoint: merge SurveyConfig into pipeline config
```

**Timing contract:**
- If Phase 1A finishes before the user completes the survey: wait (show "Almost ready — finish your answers to continue").
- If user skips or survey times out (60s): proceed with defaults.
- Survey responses stored in `meta.surveyResponses` for ML feedback loop.

### Phase 1B — Expensive stages (runs after survey, informed by survey config)

```
  ▼ [Thumbnail Generation — Web Worker, OffscreenCanvas]
  │   Output: thumbnailDataUrl embedded into each PhotoData
  │   Memory: thumbnailDataUrl is ~30–50KB per photo (in RAM as string)
  │   For 5,000 photos: up to 250MB. Monitor total and warn if >150MB available.
  │
  ▼ [Quality Scoring — ML, optional, browser WASM]
  │   Output: qualityScore added to each PhotoData
  │   Initial MVP: classical heuristics (blur detection, exposure)
  │   Later: NIMA model via TF.js
  │
  ▼ [Hero Selection — informed by quality score + survey prefs]
  │   Default: highest quality score in group
  │   With survey: bias toward days user marked as highlights,
  │                prefer photos with faces if user selected people
  │
  ▼ [Chapter Builder]
  │   Output: Story Skeleton (serialisable, no File objects)
  │   Memory: all File references dropped here; only thumbnailDataUrls remain
```

---

## Memory Management

| Stage | Action |
|---|---|
| File selection | `URL.createObjectURL(file)` for preview grid only — these are lightweight (disk-backed) |
| After EXIF extraction | Revoke preview blob URLs for photos that fail dedup |
| After dedup | Revoke blob URLs for all rejected duplicates immediately |
| During thumbnail gen | OffscreenCanvas output is a Blob → `URL.createObjectURL(blob)` → convert to data URL → revoke blob URL |
| After chapter build | Revoke blob URLs for all original File objects; only thumbnailDataUrls remain |
| After Part 2 render | Only hero thumbnails are visible at full size; consider downscaling non-hero thumbnails further |

**Estimated RAM at steady state (5,000 photos, after pipeline):**
- Thumbnail data URLs: ~5,000 × 40KB = ~200MB (upper bound; most trips are 200–1,000 photos)
- Chapter hero data URLs: subset of the above, already counted
- No File bytes in RAM (all revoked)

**Guard:** check `navigator.deviceMemory` before starting Phase 1B. If ≤2GB available (or device is flagged by compatibility check), offer to process in a reduced mode (fewer photos per batch, lower thumbnail resolution — 200px instead of 400px).

---

## Implementation Phases

### Phase 0 — Foundation **[MVP]** (do first, unblocks everything)

| Task | MVP? | Detail |
|---|---|---|
| Branch consolidation | done | Consolidated to `main` |
| PWA manifest | done | `public/manifest.json` + meta tags in `index.html` |
| Compatibility check | MVP | Gate app on load; block if requirements not met |
| Local/Server mode badge | post-MVP | Nothing server-side ships in MVP; add when server features land |
| Remove itinerary UI | MVP | `UploadPage.jsx` — remove sample itinerary, JSON textarea, mode selector |
| Remove dnd-kit | MVP | `package.json`, `EditablePhotoLayout.jsx` — removes drag-to-reorder within story chapters; native file drop zone in `UploadPage.jsx` is unaffected |
| Dev route + fixture scenarios | MVP | `/dev` route renders all 3 test scenarios simultaneously (see Testing section) |
| Vitest setup | MVP | `npm install -D vitest`; add `"test": "vitest run"` script; no further config needed |

### Phase 1 — Pipeline rebuild (Part 1) **[MVP]**

**PR 1A: Cheap pipeline stages** **[MVP]**
- `stages/exif.js` — wraps Web Worker, returns PhotoData[]
- `stages/dedup.js` — exact + perceptual hash; revokes blob URLs for rejects
- `stages/cluster.js` — day strategy (default), time-gap strategy
- `stages/dedup.test.js` — exact hash collision; near-duplicate within hamming threshold removed; photos outside threshold kept; empty input
- `stages/cluster.test.js` — correct grouping by date; no-timestamp photos land in undated group; single-photo day forms its own chapter; unsorted input produces same output as sorted

**PR 1B: Survey component + pipeline checkpoint** **[MVP — secondary]**
- `SurveyModal.jsx` — 2–3 questions, timeout logic, skip option
- Pipeline runner extended with checkpoint support (pause, wait for config, resume)
- `usePipeline.js` hook — orchestrates Phase 1A → survey → Phase 1B

**PR 1C: Expensive pipeline stages** **[MVP]**
- `stages/thumbnail.js` — Web Worker, OffscreenCanvas, memory tracking
- `stages/qualityScore.js` — blur detection (Laplacian variance on canvas, no ML)
- `stages/heroSelect.js` — quality + survey weighting
- `stages/chapterBuilder.js` — produces serialisable Story Skeleton
- `lib/validateSkeleton.js` — `isValidSkeleton(json)` schema validator; used in tests and in dev-mode runtime assertions
- `stages/chapterBuilder.test.js` — output passes `isValidSkeleton`; all chapters have a heroPhotoId; no File objects or blob URLs in output

**PR 1D: Memory manager** **[MVP]**
- `lib/memoryManager.js` — tracks blob URLs by stage, revokes on trigger
- Integration into pipeline runner

### Phase 2 — Story renderer (Part 2) **[MVP]**

> Primary quality focus for MVP: the renderer must produce output that is showable to others on mobile. This is the highest-care phase.

**PR 2A: Part 2 data layer** **[MVP]**
- `lib/storyBuilder.js` — takes Story Skeleton, produces render-ready Story
- Geocoding stage (Nominatim, progressive, 1 req/s, coord dedup)
- Trip name generation
- Block assembly

**PR 2B: Renderer components** **[MVP]**
- `StoryView.jsx` — accepts Story prop (pure renderer, no pipeline awareness)
- `Chapter.jsx` — block-based rendering
- `EditablePhotoLayout.jsx` — layout patterns (pair, single, asymmetric, trio); remove dnd-kit drag-to-reorder, keep layout rendering
- Progressive geocoding: chapters update in place as locations resolve

**PR 2C: Photo swap interaction** **[MVP — secondary]**
- Each selected photo has a swap affordance (icon overlay on hover/tap)
- Tapping swap opens a grid of 4–6 alternative candidates from the same chapter's pool
- One tap selects the replacement; the story updates in place
- Swap choices are recorded in the Story Skeleton (`meta.swapHistory`) as the first source of preference signal for the personalisation roadmap
- Drag-to-reorder within a story remains out of scope

**PR 2D: Mode indicator + boundary notification** **[post-MVP]**
- `ModeBadge.jsx` — "Local mode" / "Server mode" badge, always visible in header
- `ServerModeBoundaryModal.jsx` — one-time notification explaining what gets sent when first server feature is triggered
- Triggered on: first geocoding request (if routed via server) or first caption generation

### Phase 3 — Server enrichment (opt-in) **[post-MVP]**

- Caption generation: send hero thumbnails + chapter metadata → Claude API proxy
- Share: upload thumbnails + Story Skeleton → cloud storage → shareable URL
- Server receives: thumbnails (400px) + Story Skeleton JSON. Never: original photos, File metadata, user identity (unless they create an account)

### Phase 4 — ML selection (iterative) **[post-MVP, except Laplacian blur]**

| Model | Size | Purpose | MVP? |
|---|---|---|---|
| Laplacian blur | 0 | Blur detection (classical) | **MVP** — ships in Phase 1C |
| MediaPipe Face Detection | ~5MB | Face count per photo | post-MVP |
| NIMA (TF.js) | ~15MB | Aesthetic quality score | post-MVP |
| MobileNet | ~5MB | Scene classification | post-MVP |
| CLIP (Transformers.js) | ~150MB | Semantic embeddings, variety selection | longer-term |

Service worker model caching: add alongside the first ML model that gets shipped. Do not add service worker earlier.

---

## Compatibility Check

Run on app initialisation, before any UI renders:

```js
const checks = {
  webWorkers:    typeof Worker !== 'undefined',
  offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
  minCores:      navigator.hardwareConcurrency >= 4,
  // deviceMemory only available in Chrome/Edge (~85% of users)
  minMemory:     !navigator.deviceMemory || navigator.deviceMemory >= 4,
};

const passed = Object.values(checks).every(Boolean);
// If !passed: render CompatibilityBlock component, do not load pipeline
```

Show a clear message listing what failed. Do not attempt degraded processing — the UX would be worse than a clear rejection.

---

## PWA Strategy

| When | What |
|---|---|
| Now | `manifest.json` (installability) + meta tags |
| With first ML model | Service worker (app shell cache + model cache) |
| Later | Background sync, file system access API |

---

## Testing Strategy

### Automated tests (Vitest)

Install once at the start: `npm install -D vitest`, add `"test": "vitest run"` to `package.json`.

#### What to test

**`dedup.js` and `cluster.js` — unit tests, written alongside each stage.**
Both are pure, deterministic functions with clear contracts. Test these:

- `dedup`: exact hash collision removes duplicate; near-duplicate within hamming threshold removed; photos outside threshold kept; empty input handled
- `cluster`: photos group correctly by calendar date; photos with no timestamp land in undated group; single-photo day forms its own chapter; photos already sorted vs. unsorted produce the same output

**Story Skeleton schema — enforce via `isValidSkeleton(json)` validator.**
`chapterBuilder` correctness is validated structurally: the output either satisfies the schema or it doesn't. No separate behaviour tests for the builder itself.

#### What to skip

| Stage | Reason |
|---|---|
| `heroSelect.js` | TBD — deterministic in current form (middle photo), but lightweight enough to revisit |
| `qualityScore.js` | Results are ambiguous; no meaningful assertion possible |
| `runner.js` | Chaining logic is simple; cost of maintaining tests > benefit |
| React components | Layout quality is visual; snapshot tests catch nothing useful |
| Workers | Too much setup; logic belongs in the stage, not the wrapper |
| Geocoding | External network dependency |

#### ML stage testing strategy (for when ML models are introduced)

Do not test model accuracy with unit tests — that is a model evaluation problem, not a software correctness problem. Test structural and boundary behaviour only:

- Output shape is correct (score in 0–1 range, required fields present)
- Stage handles edge inputs without throwing (zero photos, photos with no pixel data)
- Directional assertions with evaluation fixtures: a known-blurry photo scores lower than its known-sharp counterpart

Keep a small labelled fixture set (a handful of known-good / known-bad photos) for this purpose. Run it manually when a model or scoring stage changes, not on every commit.

---

### Manual testing

**Two things to test separately:** selection quality (did the algorithm pick well?) and story UI (does it look good?).

#### Pipeline debug overlay

Gate behind `?debug=1`. Adds a panel below the story showing per-photo pipeline decisions:

```
[thumbnail]  cluster: Day 2  |  hero: ✓  |  dedup: kept    |  quality: 0.82
[thumbnail]  cluster: Day 2  |  hero: –  |  dedup: kept    |  quality: 0.61
[thumbnail]  cluster: Day 1  |  hero: –  |  dedup: REJECT  |  reason: hamming 3
```

This turns selection quality from a gut-feel evaluation into something readable at a glance.

#### Dev route — `/dev`

A developer-only route that renders all three fixture test scenarios simultaneously, without any file upload. Because `StoryView` is a pure renderer that accepts a Story Skeleton, fixture skeletons can be hardcoded JSON fed directly to the renderer — no pipeline run, no drag-and-drop, instant load.

| Scenario | Chapters | Photos | What it stress-tests |
|---|---|---|---|
| Short trip | 3 days | ~30 photos | Minimal chapters, basic layouts |
| Long trip | 10 days | ~200 photos | TOC, many chapters, long location names, geocoding |
| Edge case | 1 day | Mixed portrait/landscape, some chapters with 1 photo | Layout robustness, single-photo chapters |

Fixture thumbnails use tiny placeholder data URLs (real images not required for layout testing). Metadata — timestamps, GPS coords, photo counts — is realistic. Add the `/dev` route in Phase 0 alongside the pipeline work; it will pay back time on every subsequent UI change.

#### Fixture photo library

A small folder (`fixtures/`) of real photos (~50) with known properties for pipeline testing:
- Exact duplicate pair
- Near-duplicate burst (4–5 shots, hamming ≤ 5)
- One blurry / one sharp version of the same scene
- Photos with no EXIF timestamps
- Photos with no GPS data
- Photos spanning 3+ calendar days

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Memory exhaustion on large collections | Medium | High | Memory manager, reduced mode for low-RAM devices |
| Survey adds friction and users skip it | High | Medium | Keep to 2 questions max; 60s auto-timeout with sensible defaults |
| ML model first-load latency (150MB CLIP) | High | Medium | Service worker cache; load lazily; show progress; offer "skip ML" path |
| Nominatim rate limiting | Low | Low | Coord deduplication reduces to ~15 unique requests per trip |
| Phase 1A finishes too fast for survey | Medium | Low | Survey min display time (e.g. 5s) even if processing is instant |
| OffscreenCanvas not in older Safari | Low | Low | Compatibility gate blocks these users clearly |
