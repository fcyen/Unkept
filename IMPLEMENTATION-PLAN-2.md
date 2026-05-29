# Unkept — Implementation Plan 2 (Pre-Demo)

This plan captures a working session (May 2026) reviewing the state of the app
ahead of opening it for a demo. It supplements `IMPLEMENTATION-PLAN.md`; it does
not supersede it.

The two focus areas, in priority order:

1. **Curation UI changes** — the demo's primary surface (highest priority)
2. **Performance / loading fix** — the wait after "Start curating" (second)

---

## Context & decisions

These framed the work below and are recorded so the rationale isn't lost.

| Topic | Decision | Rationale |
|---|---|---|
| **PWA vs native iOS** | **Stay PWA for now.** Revisit native only after real product signal. | The one strong argument for native is Safari's ~1–2GB memory ceiling (the app holds image bitmaps). But a Swift rewrite pulls hard against the project's stated learning goals (AI app dev + slideshow/motion design) and loses the "it's just a URL" demo friction. Mitigate memory within the PWA (eager blob revocation, two-phase thumbnails) instead. |
| **Part 3 (slideshow) for the demo** | **Hide it from the main user flow**, but keep developing it. The demo ends at curation → download. | The slideshow is the primary *design* learning surface and isn't demo-ready (flat 2s/frame pacing, no music-sync). Showing it half-baked sets the wrong impression. |
| **Keep Part 3 reachable for dev** | "Hide" means *remove from the main flow*, not delete. Keep the `/dev` route wired to `SlideshowPlayer` with the three fixtures. | Hiding it from users and developing it are in tension; the dev route resolves that — instant iteration stays available. |
| **Download resolution** | Download must export **full-res originals**, not the ≤1000px thumbnails. | For a personal-memories product, downscaled images aren't an acceptable deliverable. See the memory-model note in Part A. |
| **Trip name source** | **Survey question, not geocoding.** | Geocoding can only ever produce a place name ("Portugal"), never a title; it's also network-bound and rate-limited. A user-supplied name ("Lisbon weekend") is better and instant. The `meta.surveyResponses` hook already exists. |

---

## Part A — Curation UI changes (priority 1)

### A1. Pre-pipeline survey (trip name + target count)

**This executes existing design intent.** `IMPLEMENTATION-PLAN.md` already calls
for a two-phase pipeline where "survey collects user preferences during this
time," and `meta.surveyResponses` is plumbed end-to-end (`runner.js:156`) and
read by curation (`CurationScreen.jsx:24`) — but nothing ever writes it, so
`targetCount` is always undefined and chapter targets silently fall back to a
flat ~20% heuristic. The slot is built and waiting.

Build a short intake (1–2 questions) shown before/around the pipeline run:

- **Trip name** → replaces the `tripName || 'trip'` fallback that currently
  shows in two of the most-read spots: the curation topbar
  (`CurationScreen.jsx:70-72`) and the Celebration headline
  (`Celebration.jsx:48`). Fixes the literal "trip" blemish, and bites harder
  now that geocoding (the other name source) is off the curation path.
- **Target keep count** → writes `meta.surveyResponses.targetCount`, finally
  activating the dormant proportional per-chapter target logic instead of the
  flat 20% fallback.

**Crossover with performance:** the survey doubles as something for the user to
*do* while the pipeline grinds — it fills the wait. See Part B.

Writes: `meta.surveyResponses = { tripName, targetCount }`.

### A2. Celebration → full-res download

The completion screen is currently built around **"Play your story"** as the
primary CTA (`Celebration.jsx:65`) — a dead end once Part 3 is hidden.

- Make **full-res download** the primary CTA; restyle it out of its current
  secondary/ghost treatment (`curation.css:323` `.download`).
- Remove "Play your story".
- Keep "Keep refining" as the secondary action.

### A3. Hide Part 3 from the main flow

- Gate `SlideshowPlayer` at the App router (`App.jsx:76-82`) so the curation
  `onComplete` no longer routes into the slideshow.
- Keep the `/dev` route wired to `SlideshowPlayer` + fixtures for development.

### A4. Full-res download plumbing

Today `downloadCuratedPhotos` (`curatedDownload.js`) zips the ≤1000px thumbnail
data URLs. We need originals.

- Retain a `Map<photoId, File>` of originals at the **App level** (outside the
  pipeline), alive through curation. Holding a `File` reference is cheap — it's
  a lazy handle to bytes on disk; only reading/decoding pulls bytes into memory.
- At download time, read only the **kept** files, stream into the zip
  (`zip.js`), release as you go. The hot decoded-bitmap path is unchanged.
- **Memory-rule note:** this relaxes CLAUDE.md's *"no File references survive
  past chapter building."* Reframe it to: *"no decoded image data survives past
  chapter building; original File handles for the kept set are retained for
  export only."* Update CLAUDE.md when implemented.

### A5. Keep-and-advance / chapter hand-off (was "B4" — confirmed worth adding)

Tested in-app and confirmed worth doing. Keeping a photo auto-advances
(`onKeep` → `setTimeout(goNext, 240)`, `CurationScreen.jsx:206`), but `goNext`
clamps at the last index — so the keep-and-advance rhythm dead-ends at each
chapter's last photo with no cue. Add a "chapter complete → roll into next
chapter" hand-off so the whole pass feels like one continuous motion.

### A6. Mobile responsiveness check (low priority)

`.curation-stage` is a fixed flex row (main column + 64px right strip) with a
scrolling bottom strip below (`curation.css:132-153`). On a narrow phone that's
three competing zones in limited height. Likely fine, but validate on a real
device before demo rather than eyeballing.

> **Dropped this session:** keyboard navigation (deferred) and post-remove undo
> (redundant — the keep toggle already re-adds a photo).

---

## Part B — Performance / loading fix (priority 2)

The wait after "Start curating" has both a structural cause and a perceptual
one.

### B1. Remove geocoding from the curation hot path (restores documented design)

`UploadPage.jsx:71-102` runs `resolveSkeletonLocations()` (Nominatim) during
finalization, **before** handing off to curation — the button literally sits on
"Resolving locations… 3/8". This is:

- **A regression** from the documented design ("Geocoding lives in Part 3").
- **Network-bound and unshortenable:** `geocode.js:14,77-79` is locked to one
  request per 1100ms (Nominatim's 1 req/sec policy; parallelizing risks a ban),
  so an N-area trip has a ~1.1s × N floor.
- **Invisible right now:** its only consumers (location labels, country) live in
  Part 3, which is hidden.

Action: pull geocoding off the curation path entirely. Reintroduce it later,
**overlapped with the pipeline** (so labels are ready in the background without
a blocking phase) when Part 3 returns.

### B2. Live "developing" preview grid (perceptual — highest payoff/effort)

During the wait, the screen shows a static preview grid (first 24 blob
thumbnails) and a dark button cycling canned phrases every 1.8s
(`useCyclingPhrase`, `UploadPage.jsx:288-301`). Nothing reflects real progress.

Turn the existing preview grid into the progress surface: sharpen thumbnails in
as the pipeline emits them, dim/collapse frames as dedup rejects them, mark
heroes as `heroSelect` runs. This fills the wait with something *true* and
serves the project's "make AI/pipeline decisions visible" learning goal — the
upload-side twin of the `/pipeline` debug route.

### B3. Survey fills the wait (crossover with A1)

The pre-pipeline survey (A1) gives the user something to do while Phase 1 runs —
the cheapest perceptual win, and it's already on the build list.

### B4. Two-phase thumbnails

`thumbnail.js` does a full decode + dual-tier JPEG encode (1000px + 200px) per
photo — the heaviest stage. Encode the small 200px tier first (fast, unblocks
the curation grid), defer/stream the 1000px hero tier.

### B5. Worker concurrency

Bump the heavy stages (thumbnail, dedup) from a fixed 4 workers to
`navigator.hardwareConcurrency`.

### B6. Progressive handoff (stretch)

Open curation on chapter 1 as soon as it's ready, rather than waiting for the
entire set to finish processing.

---

## Suggested sequence

1. **A1** survey (fixes trip name, activates target logic, fills the wait) +
   **B1** drop geocoding from the hot path — these unblock each other and are
   preconditions for cleanly hiding Part 3.
2. **A3** hide Part 3 + **A4** full-res download + **A2** Celebration rewrite —
   one coherent "demo endpoint" pass.
3. **A5** keep-and-advance hand-off.
4. **B2** developing preview grid.
5. **B4/B5** structural perf, if the perceptual fixes aren't enough.
6. **A6** mobile check before demo.
