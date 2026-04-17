# PhotoStory — MVP Scope

## Goal

Ship something showable to others. A real photo story that renders beautifully on mobile, built on an architecture that can expand.

## Definition of Done

A user drops in a folder of photos from a trip or special occasion, optionally answers one question, and within a minute watches a Wrapped-style slideshow (with music) they are comfortable handing over to someone else on their phone.

## MVP Constraints

- **Photo volume cap:** up to 500 photos per trip for immediate in-browser processing. Larger collections are post-MVP (streaming / chunked processing).
- **Drop-in method:** drag-and-drop / file picker only. Date-range-driven photo-library fetch requires mobile OS integration and is post-MVP.
- **Output:** view-only slideshow in the browser. No refinement, no sharing, no export in MVP.

---

## What's In

### Core — must ship before anything else

| Feature | Notes |
|---|---|
| Mobile-first upload flow | Drag-and-drop; must feel native on a phone; capped at 500 photos |
| Compatibility gate | Block unsupported devices clearly before any processing starts |
| Full processing pipeline | EXIF → dedup → clustering → blur-based hero selection → chapter builder |
| Story Skeleton (Part 1 / Part 2 boundary) | Serialisable JSON artifact; the architectural foundation everything else builds on |
| Darkroom processing view | The "wait" experience — frames the curation as magic, not as delay |
| Wrapped-style slideshow renderer | Cover → chapter dividers → photo cards → coda; auto-advancing, tap-to-page; the primary quality bar for MVP |
| Background music | 2–3 bundled royalty-free tracks; starts on cover CTA, loops, fades at coda — carries the emotional lift |
| Geocoding | Location labels on chapters and cover; makes stories feel real |

### Secondary — in MVP because they wire up expansion infrastructure

| Feature | Notes |
|---|---|
| Survey (1 starter question, optional) | Wires up the personalisation pipeline; runs concurrently during Phase 1A processing |

The secondary features are lower priority — get the core loop working and looking good first.

---

## Quality Bar

**"Showable to others" is the bar — not just functional.** The slideshow is what the user sees; rough pipeline edges are acceptable in MVP, rough slideshow output is not.

- Hero images look good — blur detection ensures this
- Chapter titles include real location names (geocoding)
- Slideshow pacing feels intentional — frame timing, animation rhythm, music
- Emotional target: **"Wow, what a fun trip I've had — can't wait to show my friends."** The slideshow should feel magical on the reveal and replayable when handed over.

---

## What's Out of MVP

| Feature | When |
|---|---|
| Refinement mode (photo swap, caption editing, retitling) | Post-MVP (Moment 5) — MVP is view-only |
| Gallery view (random-access thumbnail grid) | Post-MVP — MVP is slideshow-only |
| Cross-trip stats / "record" comparisons | Post-MVP — requires persisted history |
| Date-range-driven photo fetch (mobile OS integration) | Post-MVP — drop-in is drag-and-drop only |
| AI captions | Post-MVP (requires server) |
| Sharing / export | Post-MVP |
| ML aesthetic scoring (NIMA) | Post-MVP |
| Face detection (MediaPipe) | Post-MVP |
| Semantic embeddings (CLIP) | Longer-term |
| PWA / service worker | Post-MVP (add with first ML model) |
| Server mode indicator | Post-MVP (nothing server-side ships in MVP) |
| Preference learning from swap history | Post-MVP |

---

## Implementation Reference

See `IMPLEMENTATION-PLAN.md` for phase-by-phase breakdown. MVP phases are marked **[MVP]**; post-MVP work is marked **[post-MVP]**.
