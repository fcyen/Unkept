# Phase 2 — Design Intent

This doc captures the design direction for Phase 2 (story renderer). For scope and PR breakdown, see `IMPLEMENTATION-PLAN.md`. For MVP constraints, see `MVP.md`.

---

## Product thesis

**The value is the curation. The app's job is to make that curation effortless to create and effortless to show.**

Phase 1 auto-curates a trip into chapters and heroes. Phase 2's job is to stay out of the way between "I dropped in my photos" and "I'm holding my phone in front of my mom." Editing is a failure mode — every swap, rename, or reorder the user has to do is a bit of friction the auto-curation didn't earn.

Closest spiritual cousins: **Apple Memories**, **Google Photos Memories**, **Spotify Wrapped**. All solve the same interaction problem — *the machine gave me a draft, now I just need to sit back and watch*.

---

## Learning goal

**UI/UX design**, not editorial design. Specifically:

- State machines (four moments, each with entry/exit conditions)
- Progressive disclosure (when affordances appear and disappear)
- Gesture design (tap-to-page, hold-to-pause, tap-once-for-controls)
- Transition animations + micro-interactions
- Trust UX (making the auto-curation feel trustworthy without explaining it)

---

## Emotional target

> *"Wow, what a fun trip I've had — can't wait to show my friends."*

Celebratory, slightly surprised, ready to share. The slideshow should feel magical on the first reveal and replayable when the phone gets handed over.

---

## The four moments

The product is not "a page" — it's a sequence of four distinct moments with different UI needs.

### Moment 1 — Drop-in
User dumps a folder of photos. Drag-and-drop only for MVP (date-range fetch requires OS photo library integration — post-MVP). Up to 500 photos. The drop itself should feel satisfying — "throwing photos into a darkroom" is the working metaphor.

### Moment 2 — The wait (the "Darkroom")
Processing runs. Visual metaphor: film development. Thumbnails fade in on a dim background as EXIF, dedup, and thumbnail stages complete. Short copy describes the current stage ("Finding duplicates...", "Choosing highlights...", "Finding locations..."). The darkroom wait also absorbs geocoding (~7s for a typical trip) — the slideshow doesn't start until geocoding is finished so chapter dividers have locations on first play.

### Moment 3 + 4 — The reveal (also the show)
**Merged into a single experience.** When processing is done, the cover frame appears and waits for the user's tap ("Ready to relive your trip"). That tap starts music + auto-advancing slideshow. The same slideshow is what the user shows to someone else — just tap "play again" or hand over the phone.

No scrolling editorial page. No review UI. The slideshow is the product.

### Moment 5 — Refinement *(post-MVP)*
Captions, story paragraphs, photo swaps, retitling. Deferred. MVP is view-only.

---

## Design direction

**Wrapped-style slideshow** with music. Auto-advancing frames, tap-left/tap-right override, segmented progress bar hidden until tap-to-pause.

**Primary references to study:**
- Spotify Wrapped — frame pacing, stat cards, music as emotional carrier
- Apple Memories — auto-curation trust, opaque magic, minimal edit affordances
- Google Photos Memories — same pattern, slightly different frame vocabulary
- Polarsteps — the show-gesture (tap-right-to-page) is learned behavior worth stealing

---

## Storyboard

### Cover card
- Trip title: `<Country>, <Month Year>` — e.g. "Indonesia, May 2025"
- Achievement stat: `<N>km travelled`, derived from sum of haversine distances between chapter centroids. Suppressed below 50km threshold — falls back to photo count ("847 photos") for short / local trips.
- CTA: **"Ready to relive your trip"** — this tap is the handoff. It satisfies mobile autoplay restriction, starts music (fade-in 2s), and begins auto-advance.
- Waits indefinitely for the tap.

### Chapter divider card
- Three horizontal rectangles stacked: photo / text / photo
- Text: "Day N" + places visited (from geocoding), e.g. "Day 1 — Medan, Berastagi"
- Entry animation: photos already in place; text flies in from behind
- Exit animation: top photo slides left, bottom photo slides right
- Duration: ~3s

### Photo card
One photo card per chapter in MVP (multiple per chapter is post-MVP). Five layout options chosen based on the orientation mix of the chapter's selected photos:

| Layout | When |
|---|---|
| `landscape-3` | 3 landscape stacked; flip-from-top entry |
| `portrait-4` | 4 portraits; flip-from-left, staggered |
| `mixed-2p-1l` | 2 portraits above, 1 landscape below |
| `landscape-2` | 2 landscape stacked |
| `portrait-1` | single portrait, full-frame fallback |

Selection priority: show the most photos possible while matching hero orientation; degrade to `portrait-1` when no richer layout fits. Photos selected as hero + next N−1 by quality score.

No captions on photo cards in MVP — text lives only on chapter dividers. *(Correction: captions as a bottom overlay are in scope; see "Decisions locked" below.)*

Duration: ~4–5s (enough time for all photos to animate in and register).

### Coda card
- Text: **"The end."**
- Play-again button
- Duration: 5s, then holds.

---

## Decisions locked

| # | Decision |
|---|---|
| 1 | **Distance stat:** sum of haversine between chapter centroids. Below 50km, swap to photo count. |
| 2 | **Photo card selection:** hero + next N−1 by quality score. Hero always included. |
| 3 | **Photo card layouts:** five variants (see storyboard above), `portrait-1` as fallback. |
| 4 | **Frame timing:** cover ∞ / divider 3s / photo card 4–5s / coda 5s then holds. Transitions ~400ms. |
| 5 | **Captions on photo cards:** bottom overlay. |
| 6 | **Coda voice:** "The end." (MVP default; more variety is post-MVP) |
| 7 | **Progress indicator:** segmented bar at top, hidden until tap-to-pause. |
| 8 | **Music:** one bundled default track. Starts on cover CTA. Fade in 2s, loop throughout, fade out 2s at coda. No track selector in MVP. |
| 9 | **Geocoding:** slideshow blocks on geocoding completion (absorbed by darkroom wait). Chapter dividers always have location labels on first play. |

---

## What MVP is explicitly NOT doing

- No scrolling editorial page — slideshow is the only view
- No gallery / thumbnail grid (post-MVP)
- No refinement mode — no swap, rename, retitle, caption-edit, reorder
- No cross-trip stats or "records" — requires persisted history
- No date-range photo-library fetch — drag-and-drop only
- No sharing / export
- No AI captions
- No multi-track music selector
- No per-chapter music scoring
- No reflective free-text surveys — single-question survey only
- No reordering within the slideshow
- No multi-card-per-chapter slideshows (one photo card per day for MVP)

---

## Before writing code for PR 2B

- [ ] Re-read this doc and the storyboard with fresh eyes on a phone
- [ ] Sketch the darkroom processing view — what does "photos developing" actually look like?
- [ ] Decide music track(s) to bundle (source: Pixabay Music / Uppbeat)
- [ ] Build `/dev` route fixture skeletons for all 3 scenarios so PR 2B can iterate instantly
- [ ] Accept that the first slideshow iteration will feel wrong — iterate against the emotional target until it doesn't
