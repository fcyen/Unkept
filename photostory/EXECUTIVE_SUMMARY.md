# PhotoStory — Executive Summary

> **Questions for founder** are marked **[Q]** throughout. Answers will sharpen the roadmap and go-to-market strategy.

---

## What Is PhotoStory?

PhotoStory is a privacy-first web application that transforms a large, unorganised collection of photos into a curated, editorial-style narrative story — automatically. Users drop in photos from a trip or event; the app selects the best shots, groups them into chapters, and renders a beautiful scrollable story.

**The core privacy promise:** photos are processed entirely on the user's device. Nothing leaves the browser until the user explicitly opts into a server-side feature. This is not just a policy claim — it is structurally enforced by the architecture, and demonstrable by disconnecting from the internet.

---

## The Problem

People take hundreds or thousands of photos on a trip and rarely revisit them. Existing solutions either require uploading everything to the cloud (Google Photos, iCloud), demand manual curation effort, or produce generic output that does not feel personal. The result: memories sit on a hard drive, unshared and unlived-in.

**[Q] Is the primary use case travel photography, or is this broader (weddings, events, family moments, etc.)? The answer affects clustering strategy, ML model selection, and marketing.**

---

## The Solution

PhotoStory does two distinct things, architecturally kept separate:

**Part 1 — Selection (100% local, no network):**
The app ingests raw photos and runs a processing pipeline — deduplication, clustering, quality scoring, and eventually ML-based selection — to produce a curated set of photos organised into chapters. The output is a portable Story JSON: a serialisable, network-free artifact representing the selection.

**Part 2 — Rendering (progressively enhanced):**
The Story JSON is handed to a renderer that produces a magazine-style narrative. Geocoding (turning GPS coordinates into location names), captions, and a trip title are layered in. Captions via AI are opt-in and the only time photos leave the device (as thumbnails only).

This separation means Part 1 can be improved independently — better ML models, smarter selection — without touching the renderer, and vice versa.

---

## Differentiation

**[Q] What is the primary differentiator from Apple Memories, Google Photos highlights, and Samsung Gallery stories?**

Current hypothesis based on the architecture:

| Dimension | Apple/Google | PhotoStory |
|---|---|---|
| Privacy | Upload required | Local-first, verifiable |
| Output format | Auto-generated reel/slideshow | Editorial, scrollable story |
| Curation control | Automatic, opaque | Survey-informed, user-steerable |
| Platform lock-in | Requires their ecosystem | Load a URL, any device |
| Export | Limited | Portable Story JSON |

**[Q] Is the long-term vision a consumer product (B2C) or does this have B2B potential (travel agencies, photographers, event organisers who want to generate stories for clients)?**

---

## Target User

**[Q] Who is the primary user persona? Some candidates:**
- A frequent traveller who wants to turn a two-week trip (500–2,000 photos) into something shareable
- A parent preserving family event photos
- A professional photographer creating client deliverables

**[Q] What devices do target users primarily use — desktop or mobile? This significantly affects the ML strategy (mobile browsers have tighter memory constraints).**

---

## The Selection Algorithm — The Moat

The selection algorithm is where the product differentiation lives. The roadmap moves from simple heuristics to progressively smarter ML:

1. **Now:** EXIF-based clustering (date, time gap), deduplication, basic hero selection
2. **Near-term:** Blur detection, exposure quality scoring (classical CV, no ML)
3. **Mid-term:** Aesthetic quality scoring (NIMA model, ~15MB, runs in browser), face detection for person-presence weighting (MediaPipe, ~5MB)
4. **Longer-term:** Semantic embeddings (CLIP via Transformers.js, ~150MB cached) for similarity clustering and intelligent variety selection

All of this runs in the browser — no photo upload required at any stage.

**The survey feature** (rough idea, needs product refinement): during the time the pipeline runs its cheap early stages (EXIF extraction, deduplication — typically 10–60s for large collections), a short survey prompts users: *What kind of trip was this? Who are the key people? Any moments you especially want to capture?* The answers feed directly into the ML weighting for the second phase of the pipeline. This turns dead processing time into signal collection, and transforms the selection from opaque automation into something that feels collaborative.

**[Q] How much user control over the selection should exist in MVP vs. later? Should users be able to mark favourites, exclude photos, or adjust the balance between chapters?**

---

## Monetisation

**[Q] What is the intended monetisation model? Possible directions:**
- Free core (local processing) + paid server features (AI captions, sharing, cloud storage)
- Subscription for full feature set
- One-time purchase (Electron/installable app model)
- B2B licensing / white-label

The current architecture (local-first core, opt-in server features) naturally supports a freemium model where the privacy promise is part of the free tier.

---

## Distribution

**[Q] How do you want users to find and access the product?**
- Static web app (current): low friction, no install, load a URL
- PWA (planned): installable to home screen/desktop, offline-capable, caches ML models
- App store distribution (future consideration)

---

## What Has Been Built

A functional prototype exists:
- Photo upload with drag-and-drop
- EXIF extraction and thumbnail generation (Web Workers)
- Day-based clustering and chapter generation
- GPS geocoding via Nominatim
- Editorial-style story renderer with magazine layouts, fade-in animations, table of contents
- Pipeline runner and strategy registry infrastructure

**What the prototype does not yet have:** the clean Part 1 / Part 2 boundary, the survey feature, ML-based selection, PWA support, compatibility gating, or the Local/Server mode indicator.

---

## Immediate Decisions Required

1. **[Q] Confirm target use case and user persona** — this drives ML model priorities
2. **[Q] Confirm monetisation direction** — this determines how much to invest in server infrastructure vs. keeping the app fully local
3. **[Q] Desktop-first or mobile-first?** — desktop allows more aggressive ML (more RAM, WebGPU more available); mobile constrains model size to ~50MB cached
4. **[Q] What is the acceptable processing time for Part 1 at 1,000 photos?** — sets the performance target for ML stages
5. Branch consolidation — two development branches exist that need to be reconciled into a clean main development branch before further implementation work
