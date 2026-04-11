# PhotoStory — MVP Scope

## Goal

Ship something showable to others. A real photo story that renders beautifully on mobile, built on an architecture that can expand.

## Definition of Done

A user drops in a folder of photos from a trip or special occasion, optionally answers one question, and within a minute has a scrollable editorial story they are comfortable showing to someone else on their phone.

---

## What's In

### Core — must ship before anything else

| Feature | Notes |
|---|---|
| Mobile-first upload flow | Upload is the entry point; must feel native on a phone |
| Compatibility gate | Block unsupported devices clearly before any processing starts |
| Full processing pipeline | EXIF → dedup → clustering → blur-based hero selection → chapter builder |
| Story Skeleton (Part 1 / Part 2 boundary) | Serialisable JSON artifact; the architectural foundation everything else builds on |
| Story renderer | Mobile-responsive, editorial quality — the primary quality bar for MVP |
| Geocoding | Location labels on chapters and cover; makes stories feel real |

### Secondary — in MVP because they wire up expansion infrastructure

| Feature | Notes |
|---|---|
| Survey (1 starter question, optional) | Wires up the personalisation pipeline; runs concurrently during Phase 1A processing |
| Photo swap (4–6 candidate grid per chapter) | Wires up the candidate pool architecture and preference signal path |

The secondary features are lower priority — get the core loop working and looking good first.

---

## Quality Bar

**"Showable to others" is the bar — not just functional.** The renderer is what the user sees; rough pipeline edges are acceptable in MVP, rough story output is not.

- Hero images look good — blur detection ensures this
- Chapter titles include real location names (geocoding)
- Photo layouts feel intentional on a phone screen
- Typography and spacing reads as editorial, not prototype

---

## What's Out of MVP

| Feature | When |
|---|---|
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
