# Unkept — Executive Summary

## What Is Unkept?

Unkept is a privacy-first web app that turns a large, unorganised photo collection into a curated story — automatically and on-device. Drop in photos from a trip, a wedding, or any special occasion; the app selects the best shots, groups them into chapters, and guides you through a light curation experience that feels like a fun activity, not a chore. The result is a finished, named set of photos you are proud to share.

**The core privacy promise:** photos are processed entirely on the user's device. Nothing leaves the browser until the user explicitly opts into a server-side feature. This is not just a policy claim — it is structurally enforced and demonstrable by disconnecting from the internet.

---

## The Problem

People take hundreds or thousands of photos and rarely revisit them. Existing solutions either require uploading everything to the cloud (Google Photos, iCloud), demand manual curation effort, or produce generic output that does not feel personal. The result: memories sit on a device, unshared and unlived-in.

The sharpest pain is the overwhelm of a big library. Open 400 unorganised photos and most people close the app. Unkept reframes the task: instead of "go through 300 photos," you are "finding 12 gems for a social post." That single reframe — a concrete goal, a pre-selected starter set, and a chapter-by-chapter flow — is what makes curation feel tractable.

---

## The Solution — Five Phases

Unkept walks the user through five phases, each designed to break big decisions into small, reversible ones:

**Phase 1 — Onboard**
Import and set a goal. The user drops in photos; the app copies them, never moves them, and quietly flags duplicates in the background. One question shapes the session: pick a mode (Social post, Print album, Share with friends, Personal keepsake) and the app sets a target photo count. Reframes the task before curation begins.

**Phase 2 — Discover**
Photos arrive already organised into chapters by EXIF date, named automatically (Day 1, Day 2; location labels where GPS is available). Mood-matched ambient music plays softly as the user starts browsing — tone shifts between chapters. Framing: *"Here's your trip told as a story."*

**Phase 3 — First Win**
The app pre-selects a starter set (quality score, sharpness, story variety) so the user reacts rather than decides. One strong candidate is highlighted for a basic edit (brightness, warmth, crop) with instant before/after. The edit is saved as a named "look" — one tap applies it to the whole set later. Framing: *"You just edited a photo. That's the hard part done."* A gentle break timer appears every 30 minutes to keep energy up; everything auto-saves before it.

**Phase 4 — Curate**
The L-shape review: three-quarters of the screen shows the current photo at full size; a right strip shows neighbouring photos by timestamp (±4 around the current photo, burst groups clustering naturally); a bottom strip shows the chapter's kept photos building into a visual story. A running count steers toward the goal with skippable nudges; completing a chapter marks it done for a visible dopamine loop. One tap applies the saved look across the set with a before/after preview.

**Phase 5 — Share**
An auto-played slideshow of the curated set serves as the payoff moment: *"Your [trip name] in [N] photos."* Last-chance swaps require no backtracking. Export is goal-aware: full-res zip or compressed for social, print-ready layout with bleed and sizing, or a private shareable album link. The user's look is offered as a seed for the next trip.

---

## North Star Metric

**Completion rate** — the percentage of users who reach export after starting a curation session.

Every design decision (the pre-selected starter set, the L-shape review, the chapter-by-chapter flow, the break timer, the goal-setting modal) is evaluated against one question: does this help the user finish?

---

## Design Principles

| Principle | What it means |
|---|---|
| Less overwhelm | Break every big decision into small, reversible ones. Never show the full photo library at once. |
| Fun, not work | Progress feels like a game. Music, momentum, and small celebrations keep energy up. |
| Guided, not forced | The app makes suggestions and sets defaults. Every nudge can be ignored. |
| First win early | Get the user to a real result (one edited photo) before they've had to make any hard decisions. |
| Completion is the metric | Every design choice is evaluated against one question: does this help the user finish? |

---

## Differentiation

| Dimension | Apple/Google | Unkept |
|---|---|---|
| Privacy | Upload required | Local-first, verifiable |
| Output format | Auto-generated reel | Goal-aware export: social, print, shareable album |
| Curation model | Automatic and opaque | Reactive: app pre-selects, user swaps |
| UX philosophy | Passive consumption | Active but low-friction curation — feels like a game |
| Platform lock-in | Requires their ecosystem | Load a URL, any device |

**The moat is the curation experience, not just the algorithm.** The goal-setting model, the L-shape review, and the break timer together make a workflow that existing tools do not offer. On the roadmap: swap and edit signals train a lightweight user model so the app makes better default selections the more it is used — turning a one-time tool into a product.

---

## Target User

**Primary persona: the photo-taking traveller.** Someone who loves documenting experiences and ends up with 500–2,000 photos from a two-week trip, but dreads the hours of sorting that come afterwards. They want a story they are proud to show a friend on their phone — but they do not want to build it manually. The goal-setting model speaks directly to this user: it converts "sort 800 photos" into "find 12 for Instagram."

**Primary device: mobile.** That is where most people's photos live, and where the curation flow and slideshow need to feel native. The ML pipeline is sized accordingly: model choices prioritise what works well within mobile browser memory constraints.

---

## The Selection Algorithm

The quality of the auto-selected starter set is the first trust signal. The roadmap moves from simple heuristics to progressively smarter, more personalised ML:

1. **Now (MVP):** EXIF-based clustering (date, time gap), two-pass deduplication (exact hash + perceptual block-mean hash), Laplacian-variance blur scoring, middle-of-cluster hero selection
2. **Near-term:** Exposure quality scoring (classical CV, no ML), smarter hero selection using the blur score
3. **Mid-term:** Aesthetic quality scoring (NIMA, ~15 MB, runs in browser), face detection for person-presence weighting (MediaPipe, ~5 MB)
4. **Longer-term:** Semantic embeddings (CLIP via Transformers.js, ~150 MB cached) for similarity clustering and intelligent variety selection; preference learning from swap history

---

## MVP Scope

The current MVP is **view-only** — upload, watch the auto-generated slideshow, hand the phone over. No swap, no editing, no export. Scope is deliberately narrow so the primary quality bar is the slideshow itself: pacing, typography, music, the emotional lift at the coda. The North Star five-phase flow is the product vision; the MVP validates the selection algorithm and the Wrapped-style presentation before the interactive layer is built.

Post-MVP interactions — goal-setting, L-shape review, photo editing, look application, export modes, sharing, AI captions — are the next development surface.

---

## Why This Project

Unkept is a personal project with two goals: building something genuinely useful for personal use, and serving as a learning vehicle for AI-powered, on-device architecture. There is no commercial monetisation plan. The local-first, opt-in-server model is a product philosophy, not a freemium strategy.

---

## Distribution

The app ships as a static web app — no install, no account, just a URL. A PWA layer (installable to home screen, offline ML model caching) is planned once the first ML model ships. Mobile-first responsive design is the baseline; the curation flow and slideshow should feel as natural on a phone as in a desktop browser.

---

## What Has Been Built

Phase 1 (Selection) and Phase 2B (Slideshow playback) are wired end-to-end:

- Photo upload with drag-and-drop and a cycling per-stage status indicator
- Compatibility gate (Workers, OffscreenCanvas, ≥4 cores, ≥4 GB memory)
- EXIF extraction in a Web Worker, two-pass deduplication, day-based clustering
- OffscreenCanvas thumbnail generation with inline Laplacian-variance blur scoring
- Hero selection + chapter builder → serialisable Story Skeleton
- `storyBuilder` assembles cover → chapter dividers → photo cards → coda frames
- Nominatim geocoding (1 req/s, coord-deduped) folds labels back into the story
- `SlideshowPlayer` auto-advances through frames with bundled ambient music

**Not yet built:** goal-setting modal, L-shape review UI, photo editing (brightness, warmth, crop), look application, break timer, export modes, ML-based selection (NIMA, face detection, CLIP), sharing, PWA support.
