# PhotoStory — Claude Code Guide

## Project
Privacy-first web app that turns photo collections into editorial stories. All selection logic runs locally in the browser; server is opt-in only.

## Repo layout
```
/  (repo root)
  client/       React + Vite + Tailwind (all active development)
  server/       Express stub (Phase 3, not in active development)
  EXECUTIVE_SUMMARY.md   Product overview + open founder questions
  ARCHITECTURE.md        System design
  PLAN-v3.md             Implementation plan (current, supersedes PLAN-v2.md)
```

## Architecture in one paragraph
**Part 1 (Selection)** runs entirely offline: EXIF extraction → dedup → clustering → ML scoring → hero selection → chapter building. Output is a serialisable Story Skeleton (JSON, embedded thumbnail data URLs, raw GPS coords). **Part 2 (Story)** takes the skeleton and renders it: geocoding turns raw coords into location labels, blocks are assembled, the UI renders. Server features (captions, sharing) are opt-in and only ever receive thumbnails.

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
- No open source — do not suggest making code public
- No drag-and-drop (dnd-kit removed)
- No itinerary feature (removed in v2)
- Nominatim for geocoding (Part 2 only — it's a network call)
- PWA manifest added; service worker deferred until first ML model ships
- Compatibility gate runs before any pipeline code loads

## Branch
Develop on `main`. Feature branches off `main`, merged back via PR.

## Dev
```
cd client
npm install
npm run dev
```
