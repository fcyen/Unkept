# Unkept — Executive Summary

## What Is Unkept?

Unkept is a privacy-first web app that transforms a large, unorganised photo collection into a **Wrapped-style slideshow** — automatically. Drop in photos from a trip, a wedding, a family gathering, or any special occasion; the app selects the best shots, groups them into chapters, and plays back an auto-advancing slideshow with music, cover frame, chapter dividers, and coda.

**The core privacy promise:** photos are processed entirely on the user's device. Nothing leaves the browser until the user explicitly opts into a server-side feature. This is not just a policy claim — it is structurally enforced and demonstrable by disconnecting from the internet.

---

## The Problem

People take hundreds or thousands of photos and rarely revisit them. Existing solutions either require uploading everything to the cloud (Google Photos, iCloud), demand manual curation effort, or produce generic output that does not feel personal. The result: memories sit on a device, unshared and unlived-in.

The problem is sharpest for the traveller archetype — someone who loves taking photos but dreads the hours of sorting that come afterwards. Unkept is built first for them, with the same workflow applying naturally to weddings, family events, and other special occasions.

---

## The Solution

Unkept does two distinct things:

**Selection (Part 1)** — the app ingests raw photos and runs a processing pipeline (EXIF, deduplication, clustering, blur scoring, hero selection, chapter building) to produce a curated Story Skeleton. Runs entirely on-device; no network connection required.

**Storytelling (Part 2)** — the skeleton is rendered as a Wrapped-style slideshow: a cover frame, chapter dividers with geocoded location labels, auto-advancing photo cards, a coda, and bundled ambient music that carries the emotional lift. Geocoding (Nominatim) is the only network call; captions and sharing are opt-in future features, and even then only thumbnails would leave the device.

The two halves are kept architecturally separate so the selection intelligence can improve independently of the slideshow presentation.

---

## Differentiation

The primary differentiators, in order of importance:

| Dimension | Apple/Google | Unkept |
|---|---|---|
| Privacy | Upload required | Local-first, verifiable |
| Output format | Auto-generated reel with template polish | Wrapped-style slideshow with narrative pacing — cover, chapter dividers, coda, music |
| Curation | Automatic and opaque | Personalised (roadmap: survey-informed, preference-aware) |
| Platform lock-in | Requires their ecosystem | Load a URL, any device |

**Personalised curation is the core moat (post-MVP).** Apple Memories and Google Highlights make the same selection for everyone. The roadmap is for Unkept to learn from the user: a short survey during processing feeds selection weights, and over time the system learns from the user's swap history. The MVP ships without the survey and without swap — the architectural hooks are present, but the user-visible feature surface is deliberately narrow.

---

## Target User

**Primary persona: the photo-taking traveller.** Someone who loves documenting experiences and ends up with 500–2,000 photos from a two-week trip, but dreads the hours of sorting that come afterwards. They want a story they are proud to show a friend on their phone — but they do not want to build it manually.

**Primary device: mobile.** That is where most people's photos live, and where the slideshow needs to feel native. The ML pipeline is sized accordingly: model choices prioritise what works well within mobile browser memory constraints.

---

## The Selection Algorithm — The Moat

The selection algorithm is where the product differentiation lives. The roadmap moves from simple heuristics to progressively smarter, more personalised ML:

1. **Now (MVP):** EXIF-based clustering (date, time gap), two-pass deduplication (exact hash + perceptual aHash), Laplacian-variance blur scoring, middle-of-cluster hero selection
2. **Near-term:** Exposure quality scoring (classical CV, no ML), smarter hero selection using the blur score
3. **Mid-term:** Aesthetic quality scoring (NIMA, ~15 MB, runs in browser), face detection for person-presence weighting (MediaPipe, ~5 MB)
4. **Longer-term:** Semantic embeddings (CLIP via Transformers.js, ~150 MB cached) for similarity clustering and intelligent variety selection; preference learning from swap history

**Survey (post-MVP):** a short question that runs alongside the pipeline, feeding selection weights. Kept out of MVP because it felt awkward without the ML models it is designed to steer; the `heroSelectStage` option surface (`highlightDates`) is preserved so it can slot back in without refactoring.

**Preference memory (post-MVP):** the longer-term vision is that swap and feedback signals from past stories train a lightweight user model, so the app makes better choices the more it is used. This is the feature that makes Unkept a product rather than a one-time tool.

---

## MVP Scope

The MVP is **view-only** — the user uploads, watches the slideshow, and hands the phone over. No photo swap, no caption editing, no drag-to-reorder. Scope is deliberately narrow so the primary quality bar is the slideshow itself: pacing, typography, music, the emotional lift at the coda.

Post-MVP interactions — swap, retitling, cross-trip stats, sharing, AI captions — are tracked in `MVP.md`.

---

## Why This Project

Unkept is a personal project with two goals: building something genuinely useful for personal use, and serving as a learning vehicle for AI-powered, on-device architecture. There is no commercial monetisation plan. The local-first, opt-in-server model is a product philosophy, not a freemium strategy.

---

## Distribution

The app ships as a static web app — no install, no account, just a URL. A PWA layer (installable to home screen, offline ML model caching) is planned once the first ML model ships. Mobile-first responsive design is the baseline; the slideshow should feel as natural on a phone as in a desktop browser.

---

## What Has Been Built

Phase 1 (Selection) and Phase 2B (Slideshow) are wired end-to-end:

- Photo upload with drag-and-drop and a cycling per-stage status indicator
- Compatibility gate (Workers, OffscreenCanvas, ≥4 cores, ≥4GB memory)
- EXIF extraction in a Web Worker, two-pass deduplication, day-based clustering
- OffscreenCanvas thumbnail generation with inline Laplacian-variance blur scoring
- Hero selection + chapter builder → serialisable Story Skeleton
- `storyBuilder` assembles cover → chapter dividers → photo cards → coda frames
- Nominatim geocoding (1 req/s, coord-deduped) folds labels back into the story
- `SlideshowPlayer` auto-advances through frames with bundled ambient music

**Not yet built:** ML-based selection (NIMA, face detection, CLIP), the photo swap interaction, the optional survey, sharing / AI captions, PWA support.
