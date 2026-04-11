# PhotoStory — Executive Summary

## What Is PhotoStory?

PhotoStory is a privacy-first web app that transforms a large, unorganised photo collection into a curated, editorial-style narrative — automatically. Drop in photos from a trip, a wedding, a family gathering, or any special occasion; the app selects the best shots, groups them into chapters, and renders a beautiful scrollable story.

**The core privacy promise:** photos are processed entirely on the user's device. Nothing leaves the browser until the user explicitly opts into a server-side feature. This is not just a policy claim — it is structurally enforced and demonstrable by disconnecting from the internet.

---

## The Problem

People take hundreds or thousands of photos and rarely revisit them. Existing solutions either require uploading everything to the cloud (Google Photos, iCloud), demand manual curation effort, or produce generic output that does not feel personal. The result: memories sit on a device, unshared and unlived-in.

The problem is sharpest for the traveller archetype — someone who loves taking photos but dreads the hours of sorting that come afterwards. PhotoStory is built first for them, with the same workflow applying naturally to weddings, family events, and other special occasions.

---

## The Solution

PhotoStory does two distinct things:

**Selection** — the app ingests raw photos and runs a processing pipeline (deduplication, quality scoring, ML-based selection) to produce a curated set organised into chapters. This runs entirely on-device; no network connection required.

**Storytelling** — the curated set is rendered as a magazine-style narrative: location labels, a trip title, and optional AI-generated captions are layered in. Captions are the only opt-in server feature, and even then only thumbnails leave the device.

The two halves are kept architecturally separate so the selection intelligence can improve independently of the story presentation.

---

## Differentiation

The primary differentiators, in order of importance:

| Dimension | Apple/Google | PhotoStory |
|---|---|---|
| Privacy | Upload required | Local-first, verifiable |
| Output format | Auto-generated reel or slideshow | Editorial, scrollable story |
| Curation | Automatic and opaque | Personalised — survey-informed, preference-aware |
| Platform lock-in | Requires their ecosystem | Load a URL, any device |

**Personalised curation is the core moat.** Apple Memories and Google Highlights make the same selection for everyone. PhotoStory learns from the user: a short survey during processing (What kind of trip? Who matters most? Any key moments?) feeds directly into the selection weights, and over time the system learns from the user's own past selections to get progressively better at anticipating their taste.

---

## Target User

**Primary persona: the photo-taking traveller.** Someone who loves documenting experiences and ends up with 500–2,000 photos from a two-week trip, but dreads the hours of sorting that come afterwards. They want a story they are proud to share — but they do not want to build it manually.

**Primary device: mobile.** That is where most people's photos live, and where the app needs to feel native. The ML pipeline is sized accordingly: model choices prioritise what works well within mobile browser memory constraints.

---

## The Selection Algorithm — The Moat

The selection algorithm is where the product differentiation lives. The roadmap moves from simple heuristics to progressively smarter, more personalised ML:

1. **Now:** EXIF-based clustering (date, time gap), deduplication, basic hero selection
2. **Near-term:** Blur detection, exposure quality scoring (classical CV, no ML)
3. **Mid-term:** Aesthetic quality scoring (NIMA model, ~15 MB, runs in browser), face detection for person-presence weighting (MediaPipe, ~5 MB)
4. **Longer-term:** Semantic embeddings (CLIP via Transformers.js, ~150 MB cached) for similarity clustering and intelligent variety selection; preference learning from past selections

**The survey feature:** during the time the pipeline runs its cheap early stages (typically 10–60 s for large collections), a short survey prompts users: *What kind of trip was this? Who are the key people? Any moments you especially want to capture?* The answers feed directly into ML weighting for the second phase. Dead processing time becomes signal collection, and selection feels collaborative rather than opaque.

**Preference memory:** the longer-term vision is that swap and feedback signals from past stories train a lightweight user model, so the app makes better choices the more it is used. This is the feature that makes PhotoStory a product rather than a one-time tool.

---

## MVP User Control

In the MVP, users can **swap individual photos** from the existing selection — replacing a chosen photo with another from the same chapter's candidate pool. This is intentionally scoped:

- It gives the user enough agency to correct obvious misses without collapsing into full manual curation
- It keeps the interaction simple (one tap to see alternatives, one tap to confirm)
- Swap choices are a natural first source of preference signal for the personalisation roadmap

Drag-to-reorder within a story is explicitly out of scope. The app selects; the user refines at the margin.

---

## Why This Project

PhotoStory is a personal project with two goals: building something genuinely useful for personal use, and serving as a learning vehicle for AI-powered, on-device architecture. There is no commercial monetisation plan. The local-first, opt-in-server model is a product philosophy, not a freemium strategy.

---

## Distribution

The app ships as a static web app — no install, no account, just a URL. A PWA layer (installable to home screen, offline ML model caching) is planned once the first ML model ships. Mobile-first responsive design is the baseline; the app should feel as natural on a phone as in a desktop browser.

---

## What Has Been Built

A functional prototype exists:

- Photo upload with drag-and-drop
- EXIF extraction and thumbnail generation (Web Workers)
- Day-based clustering and chapter generation
- GPS geocoding via Nominatim
- Editorial-style story renderer with magazine layouts, fade-in animations, table of contents
- Pipeline runner and strategy registry infrastructure

**Not yet built:** the clean Part 1 / Part 2 architectural boundary, the survey feature, ML-based selection, the photo swap interaction, PWA support, compatibility gating, and the local/server mode indicator.
