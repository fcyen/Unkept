# Unkept

**Cut a chaotic camera roll down to the photos worth keeping — runs entirely on browser, no photos leave the device**

[![Netlify Status](https://api.netlify.com/api/v1/badges/cff4c3b2-815c-4c6f-a61b-be8204981a5e/deploy-status)](https://app.netlify.com/projects/unkept/deploys)

[**Live demo**](https://unkept.netlify.app) · access code available on request — _it's a soft gate while the project is in private beta, not a security boundary._

![Unkept curation flow](docs/screenshots/hero.gif)

---

## What it is

Going through hundreds of photos from a trip is a chore most people abandon. Unkept aims to make the process enjoyable, lets you relive the trip, and ends with a tight set of keepers.

Drop in a few hundred photos. An on-device pipeline picks the strong candidates, groups them into chapters, and hands you a fast review flow where the real work happens — you confirm, swap, and trim the selection chapter by chapter until you have a curated, named set you're proud to share or export.

The defining constraint: **all of the selection intelligence runs locally.** You can disconnect from the internet mid-session and everything still works. No photo, thumbnail, filename, or GPS coordinate is ever uploaded. Server features are opt-in and only ever receive downsized thumbnails.

## How it works

| Stage | What happens |
|---|---|
| **1 · Selection** | An offline pipeline does the grunt work: EXIF extraction → deduplication → time-gap clustering → blur/quality scoring → candidate selection → chapter building. Output is a serialisable skeleton with a pre-selected starter set, so the user reacts rather than starts from zero. |
| **2 · Curation** | The interactive review flow. The user refines the selection per chapter in an "L-shape" layout — a large judgement view, a timestamp-neighbour strip for context, and a kept-set that builds as they go. A running count steers toward the goal; finishing a chapter marks it done. The output is a curated, named set. |
| **3 · Payoff** | A light celebration of the finished set, ending on an export/download CTA. Download the photos and post them on your favourite social media platform. |

<!-- Optional: a screenshot or two of the L-shape review. -->
<!-- ![Curation](docs/screenshots/curation.png) -->

## Engineering notes

A few parts worth a closer look:

- **A pipeline of pure functions.** Each stage is `(input, options, onProgress) => output` with no side effects, registered through a strategy table so algorithms can be swapped and compared. Heavy work runs in Web Workers. There's a `/pipeline` debug route that renders per-stage snapshots — invaluable when tuning perceptual stages.

- **Heuristics before ML, on purpose.** The selection algorithm starts deliberately simple — classical CV and heuristics (Laplacian-variance blur scoring, EXIF time-gap clustering, middle-of-cluster hero selection) — with ML scoring (aesthetic quality, face presence, CLIP semantic clustering) layered in incrementally. Implementing the simple version first makes the contribution of each ML step measurable rather than assumed.

- **Perceptual dedup that survives real bursts.** Duplicate detection runs two passes: an exact hash, then a 64-bit **block-mean** perceptual hash (32×32 → 8×8 grid of 4×4 means → bit = mean > median), windowed against recent kept frames. aHash and dHash were tried first and both failed — flat regions like sky or wall flip pixel-level comparisons under JPEG noise, producing Hamming distances of 40+ on genuine bursts. Block averaging eats that noise. The `/pipeline` view shows the exact 8×8 tile the hash sees, side-by-side with the original.

- **Memory discipline.** Blob URLs are revoked as early as possible; no decoded image data is meant to survive past chapter building. Original `File` handles are retained only for the kept set, only for export.

## Tech stack

- **Frontend:** React 18, Vite, Tailwind CSS
- **On-device processing:** Web Workers, [`exifr`](https://github.com/MikeKovarik/exifr) for EXIF, Transformers.js (for the planned in-browser ML models)
- **Geocoding:** Nominatim (the one network call, Stage 3 only)
- **Opt-in server:** Express (itinerary matching) and a FastAPI CLIP embedding server — local dev tooling, off the live path
- **Hosting:** static deploy on Netlify; PWA manifest in place, service worker deferred until the first ML model ships

## Running locally

```bash
cd client
npm install
npm run dev
```

That's the whole app — the selection pipeline, curation, and slideshow all run client-side. The opt-in `server/` services are not needed for the core experience.

```bash
npm test          # vitest
npm run build     # production build
```

## Deeper reading

- [`EXECUTIVE-SUMMARY.md`](EXECUTIVE-SUMMARY.md) — product vision, the five-phase flow, and the selection-algorithm roadmap
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — system design
- [`IMPLEMENTATION-PLAN-2.md`](IMPLEMENTATION-PLAN-2.md) — current plan of record
