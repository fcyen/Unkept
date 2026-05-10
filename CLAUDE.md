# Unkept — Claude Code Guide

## Project
Privacy-first web app that turns photo collections into Wrapped-style slideshows. All selection logic runs locally in the browser; server is opt-in only.

## Repo layout
```
/  (repo root)
  client/       React + Vite + Tailwind (all active development)
  server/       Express stub (Phase 3, not in active development)
  EXECUTIVE-SUMMARY.md   Product overview
  MVP.md                 MVP feature scope and quality bar
  ARCHITECTURE.md        System design
  IMPLEMENTATION-PLAN.md Implementation plan (supersedes PLAN-v3.md)
```

## Architecture in one paragraph
**Part 1 (Selection)** runs entirely offline: EXIF extraction → dedup → clustering → ML scoring → hero selection → chapter building → thumbnails + blur scoring. Output is a serialisable Story Skeleton (JSON, embedded thumbnail data URLs, raw GPS coords). **Part 2 (Story)** takes the skeleton and renders a Wrapped-style slideshow: `storyBuilder` assembles cover → chapter dividers → photo cards → coda frames, geocoding turns raw coords into location labels, and `SlideshowPlayer` auto-advances with bundled ambient music. Server features (captions, sharing) are opt-in and only ever receive thumbnails.

## Pipeline conventions
- Stages live in `client/src/lib/pipeline/stages/`
- Each stage: `(input, options, onProgress) => output` — pure function, no side effects
- Strategies registered in `client/src/lib/pipeline/strategies.js`
- Workers in `client/src/lib/workers/` — import with `?worker` suffix in Vite

## Memory rules
- Revoke blob URLs as early as possible (immediately after dedup rejects, after thumbnail data URLs are created)
- Never hold File bytes in memory longer than needed for the current stage
- Target: no File references survive past chapter building

## Key decisions
- Nominatim for geocoding (Part 2 only — it's a network call)
- PWA manifest added; service worker deferred until first ML model ships
- Compatibility gate runs before any pipeline code loads
- Dedup pass 2 uses a 64-bit pHash (DCT-based): resize to 32×32 grayscale → separable 2D DCT-II → take top-left 8×8 low-frequency coefficients → bit i = coeff[i] > mean(all 64). Windowed against the last 5 kept reps in filename order. Algorithm history: aHash and dHash produced d=40+ on real bursts (JPEG noise in flat regions flips pixel comparisons freely). Block-mean hash fixed burst detection but caused false positives on distinct scenes with similar overall brightness layout (same room, same outdoor lighting). DCT encodes structural frequency content rather than brightness, so photos of different subjects in the same scene now stay separate.

## Dev tooling
- `/pipeline` route renders per-stage debug snapshots. The dedup stage in particular surfaces hamming distances on every card and shows the 8×8 DCT coefficient map that the pHash actually compares, side-by-side with the original thumbnail (bright = positive coefficient, dark = negative). When tuning a perceptual stage, work from this view rather than guessing.

## Learning intent
This project has two learning goals: AI-powered application development, and slideshow/motion design.

**AI:** prioritise understanding over convenience:
- Use the raw Anthropic SDK before reaching for higher-level frameworks
- Implement simple versions (heuristics, classical CV) before ML equivalents — the contrast is the lesson
- Prefer approaches that make AI decisions visible (debug overlay, logging) over black-box integrations
- After each phase, reflect on what the AI technique contributed that the previous approach could not

**Design:** Phase 2 (Wrapped-style slideshow) is the primary design learning surface:
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
