# Unkept — Implementation Plan

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
      thumbnailUrl: "data:image/jpeg;base64,...",      // 200px, all selected photos
      thumbnailHeroUrl: "data:image/jpeg;base64,...",  // 400px, hero photos on desktop only (null on mobile)
      thumbnailFailed: false,                          // true if HEIC decode failed
      qualityScore: 0.82,    // 0–1, from blur detection on 200px thumbnail (null until scored)
      faces: 2,              // face count (null until face detection added, post-MVP)
      // note: iOS/Google favourite flags are not accessible from exported files — omitted
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
  burstGroups: [
    // Preserved by dedup for future live-photo rendering; renderer ignores until PR 2E
    {
      representativeId: "photo_5",        // the photo dedup selected (kept in story)
      candidateIds: ["photo_6", "photo_7"],  // near-duplicates that were otherwise rejected
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
  │   Memory: File objects are lightweight handles; bytes read on demand
  │
  ▼ [Deduplication — exact hash + perceptual hash]
  │   Exact hash: first/last 64KB + file size (no image decoding)
  │   Perceptual hash: ephemeral 16px canvas in worker — computed and
  │                    discarded immediately, never stored
  │   Output: deduplicated PhotoData[]
  │   Memory: blob URLs for rejected duplicates REVOKED here
  │
  ▼ [Basic Clustering — day-based or time-gap]
  │   Timestamp + GPS only — no pixel data needed
  │   Output: PhotoData[][] (grouped, ordered by date)
  │
  └──► Phase 1A complete → emit checkpoint event
       → UI: survey has collected responses by now (or timeout)
       → Resume Phase 1B with survey config
```

### Survey (parallel to Phase 1A)

The survey is not a pipeline stage — it runs concurrently in the UI while Phase 1A processes.

```
UI thread (while Phase 1A runs in worker):
  → Show 1 question (MVP):
      "Which day was your favourite?"  [multi-select from dates found in EXIF]
      — Hidden if only one date is found (single-day trip)
      — Optional; skippable; 60s timeout proceeds with no selection
  → Collect response into SurveyConfig object
  → On Phase 1A checkpoint: merge SurveyConfig into pipeline config

Post-MVP: replace with free-text input interpreted by LLM agent (PR 5A)
```

**Timing contract:**
- If Phase 1A finishes before the user completes the survey: wait (show "Almost ready — finish your answers to continue").
- If user skips or survey times out (60s): proceed with defaults.
- Survey responses stored in `meta.surveyResponses` for ML feedback loop.

### Phase 1B — Expensive stages (runs after survey, informed by survey config)

```
  ▼ [Hero Selection — informed by survey prefs]
  │   MVP: middle photo per cluster, boosted for survey-selected dates
  │   Post-MVP: quality score weighted
  │
  ▼ [Chapter Builder]
  │   Selects which photos appear in the story
  │   Output: chapter structure with photoIds and heroPhotoId
  │   At this point we know exactly which photos need thumbnails
  │
  ▼ [Thumbnail Generation — Web Worker, OffscreenCanvas]
  │   Only processes SELECTED photos (those in chapters)
  │   Two tiers:
  │     200px JPEG — all selected photos (quality scoring, ML, mobile render)
  │     400px JPEG — hero photos on desktop only (large featured image)
  │   HEIC: attempt createImageBitmap(); on failure mark thumbnailFailed,
  │         continue pipeline, surface count to UI
  │   Memory: ~120 selected × 12KB + ~6 heroes × 40KB ≈ 1.7MB typical trip
  │
  ▼ [Quality Scoring — blur detection on 200px thumbnails]
  │   Laplacian variance on canvas — no ML model needed
  │   Output: qualityScore (0–1) added to each selected PhotoData
  │   Later: NIMA, face detection, CLIP all work on 200px input
  │
  └──► Output: Story Skeleton (serialisable, no File objects or blob URLs)
       Memory: all File references and blob URLs REVOKED here
```

---

## Memory Management

| Stage | Action |
|---|---|
| File selection | `URL.createObjectURL(file)` for preview grid only — disk-backed, lightweight |
| Perceptual hash | Ephemeral 16px canvas in worker — computed and immediately discarded |
| After dedup | Revoke blob URLs for all rejected photos immediately |
| Thumbnail generation | Only selected photos; OffscreenCanvas Blob → data URL → revoke Blob URL |
| After chapter build | Revoke blob URLs for all original File objects |

**Thumbnail tiers:**
| Tier | Resolution | Size | Used for |
|---|---|---|---|
| Ephemeral micro | 16px | discarded | Perceptual hash only |
| Standard | 200px | ~12KB | Quality scoring, all ML models, mobile render, desktop non-hero |
| Hero (desktop) | 400px | ~40KB | Large featured image per chapter on desktop |

**Estimated RAM at steady state (typical 500-photo trip, ~120 selected):**
- 120 selected × 12KB (200px) = ~1.4MB
- 6 heroes × 40KB (400px, desktop) = ~240KB
- **Total: ~1.7MB** — memory is no longer a concern at typical trip sizes

**Adaptive resolution detection:** `navigator.userAgentData.mobile` with `window.innerWidth < 768` as fallback. Mobile devices receive 200px thumbnails only; no 400px tier generated.

---

## Implementation Phases

### Phase 0 — Foundation **[MVP]** (do first, unblocks everything)

| Task | MVP? | Detail |
|---|---|---|
| Branch consolidation | done | Consolidated to `main` |
| PWA manifest | done | `public/manifest.json` + meta tags in `index.html` |
| Compatibility check | done | `lib/compatibility.js` + `CompatibilityBlock.jsx`, gated in `App.jsx` |
| Local/Server mode badge | post-MVP | Nothing server-side ships in MVP; add when server features land |
| Remove itinerary UI | done | `UploadPage.jsx` — sample itinerary, JSON textarea, mode selector removed |
| Remove dnd-kit | done | `@dnd-kit/*` removed from `package.json`; `EditablePhotoLayout.jsx` replaced with static `PhotoLayout.jsx`; `Chapter`/`StoryView` reorder wiring removed |
| Dev route + fixture scenarios | done | `/dev` route renders all 3 test scenarios simultaneously (see Testing section) |
| Vitest setup | done | `vitest` installed; `"test": "vitest run"` script in `package.json` |

### Phase 1 — Pipeline rebuild (Part 1) **[MVP]**

**PR 1A: Cheap pipeline stages** **[done]**
- `stages/exif.js` — wraps Web Worker, returns PhotoData[]
- `stages/dedup.js` — exact + perceptual hash; revokes blob URLs for rejects; preserves burst groups in `skeleton.burstGroups` (near-duplicate clusters, representative + candidate IDs) rather than discarding them — enables live-photo rendering in PR 2E without a pipeline rewrite
- `stages/cluster.js` — day strategy (default), time-gap strategy
- `stages/dedup.test.js` — exact hash collision; near-duplicate within hamming threshold removed; photos outside threshold kept; empty input
- `stages/cluster.test.js` — correct grouping by date; no-timestamp photos land in undated group; single-photo day forms its own chapter; unsorted input produces same output as sorted
- HEIC handling: attempt `createImageBitmap()` per file; catch failure; mark photo as `thumbnailFailed: true`; continue pipeline; surface count to UI for a non-blocking notice

**PR 1B: Pipeline orchestrator + hook** **[done]**
- `pipeline/runner.js` — `runPipelineWithCheckpoints` supports pause/wait/resume (available for reuse)
- `pipeline/orchestrator.js` — pure async orchestrator: EXIF → dedup → cluster → heroSelect → chapterBuilder → thumbnail → qualityScore → assembleSkeleton
- `usePipeline.js` hook — thin React wrapper over the orchestrator; exposes `phase`, `progress`, `result`, `start`
- **Survey dropped from MVP** (felt awkward in testing). `heroSelectStage` keeps its `highlightDates` option but we always pass `[]` for now; the agentic survey in Phase 5A can re-introduce a non-blocking prompt later.

**PR 1C: Expensive pipeline stages** **[done]**
- `stages/heroSelect.js` — survey-weighted selection (runs before thumbnail gen)
- `stages/chapterBuilder.js` — selects which photos appear in story; output drives thumbnail generation
- `stages/thumbnail.js` — OffscreenCanvas; selected photos only; 200px standard. Laplacian variance is computed inline from the same canvas pass and stashed on `photo._rawVariance` so `qualityScoreStage` can skip a second decode. (Runs on main thread; worker hoist is a later follow-up.)
- `stages/qualityScore.js` — normalises pre-computed Laplacian variance to a 0–1 score (fast path); falls back to decoding the 200px thumbnail if variance isn't stashed
- `lib/pipeline/concurrency.js` — small `parallelMap` helper used by dedup / thumbnail / qualityScore to run ~4 photos in flight at once instead of one-at-a-time
- `lib/validateSkeleton.js` — `isValidSkeleton(json)` schema validator; used in tests and in dev-mode runtime assertions
- `stages/chapterBuilder.test.js` — output passes `isValidSkeleton`; all chapters have a heroPhotoId; no File objects or blob URLs in output

**PR 1D: Memory manager** **[done]**
- `lib/memoryManager.js` — tracks blob URLs by stage, revokes on trigger
- Integrated into the Phase 1 orchestrator (`stripFileReferences` after thumbnail, `revokeAll` on completion)

**Phase 1 performance notes (open threads to revisit)**

Testing in April 2026 surfaced that the new pipeline feels noticeably slower than the pre-Phase 1 impl. Reasons, with what we've already done and what's still open:

- *Work per photo roughly tripled.* Old impl: 1 decode (thumbnail). New impl: byte-hash (dedup pass 1), 16×16 decode (dedup pass 2), 200px decode (thumbnail), Laplacian pass (quality). Most of this is new capability (dedup, blur scoring) not pure overhead, so the fix is to run it more efficiently rather than cut features.
- *Mitigations shipped:* `parallelMap` with concurrency 4 on dedup / thumbnail / qualityScore; Laplacian variance computed inline on the thumbnail canvas (saves one decode per photo); 400px hero tier disabled for MVP.
- *Still on the table:*
  - Hoist thumbnail + dedup into a Web Worker — today everything but EXIF runs on the main thread, which both blocks React and cannot exploit a second core beyond what `parallelMap` gets from async I/O interleaving.
  - Merge dedup pass 2 (perceptual hash) with thumbnail decode — we decode each file twice today (16×16 for aHash, 200px for thumbnail). Combining into one decode + two resizes would roughly halve decode cost across the two stages.
  - Revisit `qualityScore` placement — since it's now free when thumbnail ran successfully, we could fold it into the thumbnail stage entirely and drop the separate stage, or keep it for architectural clarity. Not urgent; flagged for when we revisit stages.
  - Re-enable 400px hero tier only for the slideshow cover/divider frames, not every hero, once we know what the renderer actually needs.
  - Benchmark a typical 500-photo trip on a mid-range Android to confirm the pool size (4) is right — it's a guess, not measured.

**Integration** **[done]**
- `UploadPage.jsx` — drives `usePipeline`, animates a cycling per-stage status phrase on the Generate button, builds the Story from the skeleton via `storyBuilder.buildStory`, runs `resolveSkeletonLocations`, folds the labels back in via `applyGeocoding`, and hands the finished Story straight to `SlideshowPlayer` (wired in `App.jsx`)
- `lib/geocode.js` — replaced the photo-array API with `resolveSkeletonLocations(skeleton, onProgress)` that returns `{ chapterLocations, country }` shaped for `applyGeocoding`
- Legacy `StoryView`, `Chapter`, `PhotoLayout`, `TableOfContents`, `FadeIn`, and the `skeletonToLegacyStory` adapter have been removed now that the slideshow consumes the skeleton directly
- Legacy `lib/exif.js`, `lib/thumbnails.js`, `lib/matcher.js` and orphan `workers/thumbnail.worker.js` removed

### Phase 2 — Story renderer (Part 2) **[MVP]**

> Primary quality focus for MVP: the slideshow must be showable to others on mobile. This is the highest-care phase.
>
> **Design direction:** Wrapped-style slideshow. Auto-advancing frames — cover → chapter dividers → photo cards → coda — with bundled music. Merges the "reveal" (user sees the curated story for the first time) and "show" (user hands phone to someone else) into a single replayable experience. No scrolling editorial page in MVP; no refinement UI in MVP.
>
> **Design learning goal:** UI/UX design — state machines, gesture design, progressive disclosure, micro-interactions, transition animations, trust UX. Primary references: Spotify Wrapped, Apple Memories, Google Photos Memories.
>
> See `PHASE-2-DESIGN-INTENT.md` for the design intent and storyboard.

**PR 2A: Part 2 data layer** **[MVP]**
- `lib/storyBuilder.js` — takes Story Skeleton, produces render-ready Story (frames, not blocks)
- Geocoding stage (Nominatim, progressive, 1 req/s, coord dedup) — MVP blocks slideshow start until geocoding finishes (~7s for typical trip; absorbed by darkroom wait)
- Trip name generation (country + month + year: "Indonesia, May 2025")
- Stat derivation: distance travelled (sum of haversine between chapter centroids); suppressed under 50km threshold, falls back to photo count
- Photo card selection: hero + next N−1 by quality score. Layout chosen based on orientation mix of chapter's selected photos — see PhotoCardFrame layouts in PR 2B. Hero is always included.
- Frame assembly: one cover, one divider per chapter, one photo card per chapter (MVP), one coda

**PR 2B: Wrapped-style slideshow player** **[done]**
- `SlideshowPlayer.jsx` — accepts Story prop; state machine (idle → playing → paused → finished); auto-advances through frames
- Frame components:
  - `CoverFrame.jsx` — trip title, date range, stat line, "Ready to relive your trip" CTA (this tap starts music + auto-advance)
  - `ChapterDividerFrame.jsx` — 3-row layout (photo / text / photo); text fly-in entry, photos-slide-out-opposite-sides exit
  - `PhotoCardFrame.jsx` — five layouts based on available orientation mix:
    - `landscape-3` — 3 landscape, stacked; flip-from-top entry
    - `portrait-4` — 4 portrait; flip-from-left, staggered timing
    - `mixed-2p-1l` — 2 portraits on top, 1 landscape on bottom
    - `landscape-2` — 2 landscape, stacked
    - `portrait-1` — single portrait filling the frame (fallback)
    - Selection priority: pick the layout that shows the most photos while matching the hero's orientation constraints; degrade to `portrait-1` when no richer layout fits
  - `CodaFrame.jsx` — closing line ("That's your trip."), play-again affordance
- Frame timing: cover = until tap; divider = 3s; photo card = 4–5s; coda = 5s then holds. Transitions ~400ms.
- Gesture handlers: tap right = next, tap left = previous, hold = pause, tap once = show controls
- Progress indicator: segmented bar at top, hidden until tap-to-pause
- Captions on photo cards: out of MVP — text lives on chapter dividers only
- Iterate using `/dev` route with all 3 fixture scenarios

**PR 2C: Darkroom processing view** **[MVP]**
- `DarkroomView.jsx` — the Moment 2 "wait" screen shown between drop-in and reveal
- Visual metaphor: darkroom / film development. Thumbnails fade in on a dim background as EXIF / dedup / thumbnail stages complete. Optional red-safelight accent.
- Progress copy describes current stage ("Reading timestamps...", "Finding duplicates...", "Choosing highlights...", "Finding locations...")
- Integrates with pipeline events from `usePipeline.js` (PR 1B)
- Handoff: on pipeline + geocoding complete, transitions to the slideshow cover frame (which waits for the user's tap)

**PR 2D: Music** **[done]**
- 2–3 short ambient loops bundled with the app (~30–60s each, Opus-compressed, ~1–2MB total); royalty-free (Pixabay Music, Uppbeat, or similar)
- Audio starts on cover CTA tap (resolves mobile autoplay restriction); fades in over 2s; loops for slideshow duration; fades out over 2s at coda
- Play/pause affordance visible in tap-to-reveal controls
- MVP: one default track, no selector. Post-MVP: track selector in settings.
- User preference (on/off) stored in localStorage; on by default for the first play

**PR 2E: Photo swap interaction** **[post-MVP — Moment 5 refinement]**
- Moved out of MVP — refinement is the Moment 5 concern, out of scope for MVP reveal/show loop
- When implemented: swap affordance on photo-card photos; 4–6 candidate grid; swap choices recorded in `meta.swapHistory` for preference learning

**PR 2F: Mode indicator + boundary notification** **[post-MVP]**
- `ModeBadge.jsx` — "Local mode" / "Server mode" badge, always visible in header
- `ServerModeBoundaryModal.jsx` — one-time notification explaining what gets sent when first server feature is triggered
- Triggered on: first geocoding request (if routed via server) or first caption generation

**PR 2G: Live photos from burst groups** **[post-MVP]**
- Slideshow photo cards read `skeleton.burstGroups`; for bursts of 2–4 near-identical frames, a photo-card cell renders a loop instead of a still
- Implementation: sequence of `<img>` frames swapped on a short interval (no GIF encoding needed), or CSS animation over data URLs
- Burst data already captured by dedup (PR 1A) — no pipeline changes required
- Respects `prefers-reduced-motion`

### Phase 3 — LLM integration (opt-in) **[post-MVP]**

> Learning focus: LLM API fundamentals → tool use → agentic reasoning.
> Work through these in order — each step builds on the last.

**PR 3A: Caption generation — raw API**
- Server-side Claude API proxy (thumbnails never sent from browser directly)
- Anthropic SDK: messages, prompt caching (same system prompt per story = significant token savings), streaming
- Simple call: send hero thumbnail + chapter metadata → receive caption
- Vercel AI SDK on the client for streaming caption display in React

**PR 3B: Agentic caption generation — tool use**
- Redesign caption generation as an agent with tools:
  - `get_chapter_photos(chapterId)` — full photo list with timestamps
  - `get_location_context(coords)` — place name, region, country
  - `get_adjacent_chapters()` — narrative context (what came before and after)
  - `get_trip_overview()` — duration, countries, total photos
- Agent gathers context across tools before writing; captions gain narrative continuity
- Core learning: designing tool interfaces, reasoning about how the model uses them

**PR 3C: Story narrative agent**
- Agent reads the full Story Skeleton and generates: cover introduction, evocative trip title, emotional arc summary
- Multi-step reasoning over structured context
- Core learning: prompt chaining, context management across a long document

**PR 3D: Share**
- Upload thumbnails + Story Skeleton → cloud storage → shareable URL

### Phase 4 — On-device ML (iterative) **[post-MVP, except Laplacian blur]**

| Model | Size | Purpose | When |
|---|---|---|---|
| Laplacian blur | 0 | Blur detection (classical) | **MVP** — ships in Phase 1C |
| MediaPipe Face Detection | ~5MB | Face count per photo | post-MVP |
| NIMA (TF.js) | ~15MB | Aesthetic quality score | post-MVP |
| MobileNet | ~5MB | Scene classification | post-MVP |
| CLIP (Transformers.js) | ~150MB | Semantic embeddings, variety selection | longer-term |

Service worker model caching: add alongside the first ML model that gets shipped. Do not add service worker earlier.

### Phase 5 — Agent orchestration + preference learning **[post-MVP]**

**PR 5A: Free-text survey interpretation agent**
- User types "our best day was when we hiked to the waterfall" in the survey
- Agent uses tools to search chapters by date, location, and time of day, then returns structured selection weights
- Core learning: LLM as a translator between natural language intent and structured pipeline config
- Framework: Claude Agent SDK if coordination between search tools becomes complex

**PR 5B: Preference learning from swap history**
- `meta.swapHistory` (recorded since MVP) is the training signal
- Lightweight user model: given past swaps, predict which photos the user would swap next
- Feeds back into heroSelect weighting for future stories
- Core learning: feedback loops, the difference between rule-based and learned selection

**LLM framework progression:**

| Phase | Tool | What you learn |
|---|---|---|
| 3A | Anthropic SDK directly | API primitives: messages, tool_use, prompt caching |
| 3B | Anthropic SDK (tool_use) | Designing tool interfaces; agentic reasoning |
| 3A–3C | Vercel AI SDK | Streaming LLM responses into React |
| 5A | Claude Agent SDK | Multi-agent coordination, agent-to-agent communication |

Avoid LangChain and LlamaIndex — their abstractions obscure what is actually happening. Learn the raw SDK first; frameworks make sense once you understand what they are abstracting.

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

A developer-only route that renders all three fixture test scenarios simultaneously, without any file upload. Because `SlideshowPlayer` is a pure renderer that accepts a Story (built from a skeleton by `storyBuilder`), fixture skeletons can be hardcoded JSON fed directly into `buildStory` — no pipeline run, no drag-and-drop, instant load.

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
