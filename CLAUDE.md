# Unkept — Claude Code Guide

## Project
Privacy-first web app that turns photo collections into Wrapped-style slideshows. All selection logic runs locally in the browser; server is opt-in only.

## Repo layout
```
/  (repo root)
  client/       React + Vite + Tailwind (all active development)
  server/       Opt-in backend — neither service is on the live MVP path:
    index.js, routes/   Express itinerary-matching stub (Phase 3, not in active development)
    embed/              FastAPI CLIP ViT-B/32 embedding server — local dev tool only, called by
                        the embedding pipeline stage when semantic clustering is enabled (/pipeline)
  EXECUTIVE-SUMMARY.md   Product overview
  ARCHITECTURE.md        System design
  IMPLEMENTATION-PLAN-2.md Active plan of record (pre-demo; supersedes IMPLEMENTATION-PLAN.md)
  archived_docs/         Superseded docs kept for reference
    MVP.md               MVP feature scope and quality bar (MVP stage complete)
    PHASE-2-DESIGN-INTENT.md  Slideshow renderer design intent + storyboard
```

## Architecture in one paragraph
**Part 1 (Selection)** runs entirely offline: EXIF extraction → dedup → clustering → ML scoring → hero selection → chapter building → thumbnails + blur scoring. Output is a serialisable Story Skeleton (JSON, embedded thumbnail data URLs, raw GPS coords). **Part 2 (Curation)** is an interactive review step between selection and playback: the user adjusts the kept set per chapter (starting from the auto-selected heroes) in an L-shape screen — big judgement view, timestamp-neighbour strip, and a building kept set — then hands a filtered skeleton onward. **Part 3 (Assets/Story)** takes the curated skeleton and renders a Wrapped-style slideshow: `storyBuilder` assembles cover → chapter dividers → photo cards → coda frames, geocoding turns raw coords into location labels, and `SlideshowPlayer` auto-advances with bundled ambient music. Server features (captions, sharing) are opt-in and only ever receive thumbnails.

## Pipeline conventions
- Stages live in `client/src/lib/pipeline/stages/`
- Each stage: `(input, options, onProgress) => output` — pure function, no side effects
- Strategies registered in `client/src/lib/pipeline/strategies.js`
- Workers in `client/src/lib/workers/` — import with `?worker` suffix in Vite

## Memory rules
- Revoke blob URLs as early as possible (immediately after dedup rejects, after thumbnail data URLs are created)
- Never hold File bytes in memory longer than needed for the current stage
- Target: no *decoded* image data survives past chapter building. Original `File` handles for the *kept* set are deliberately retained past this point — they are lazy disk references (cheap), read into memory only at export time for full-res download, then released.

## Key decisions
- Nominatim for geocoding (Part 3 only — it's a network call)
- PWA manifest added; service worker deferred until first ML model ships
- Compatibility gate runs before any pipeline code loads
- Dedup pass 2 uses a 64-bit block-mean hash (32×32 → 8×8 grid of 4×4 means → bit = mean > median), windowed against the last 5 kept reps in filename order. We tried aHash and dHash first — both produced d=40+ on real bursts because flat regions (sky, wall) in tiny tiles flip pixel-level comparisons under JPEG noise. Block averaging eats that noise.

## Dev tooling
- `/pipeline` route renders per-stage debug snapshots. The dedup stage in particular surfaces hamming distances on every card and shows the 8×8 block-mean tile that the hash actually sees, side-by-side with the original thumbnail. When tuning a perceptual stage, work from this view rather than guessing.

## Learning intent
This project has two learning goals: AI-powered application development, and slideshow/motion design.

**AI:** prioritise understanding over convenience:
- Use the raw Anthropic SDK before reaching for higher-level frameworks
- Implement simple versions (heuristics, classical CV) before ML equivalents — the contrast is the lesson
- Prefer approaches that make AI decisions visible (debug overlay, logging) over black-box integrations
- After each phase, reflect on what the AI technique contributed that the previous approach could not

**Design:** Part 3 (Wrapped-style slideshow) is the primary design learning surface:
- Before each renderer PR, study 2–3 Wrapped/slideshow references (Spotify Wrapped, Apple Memories, short-form reels)
- Form a clear design intent before writing any code
- Iterate using the `/dev` route — instant visual feedback across all 3 fixture scenarios
- Design skills in scope: frame pacing and timing, typographic hierarchy on full-bleed imagery, music-synced motion, auto-advance rhythm, mobile-first responsive design, subtle transitions between frames

## Branch
Develop on `main`. Feature branches off `main`, merged back via PR. Phase 1 work currently lives on `claude/phase-1-implementation`.

## Dev
```
cd client
npm install
npm run dev
```
