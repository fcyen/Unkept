# PhotoStory — Open Items

High-priority discussion points that could affect the major implementation plan. Resolve before or alongside the phase they block.

---

## 1. HEIC Support Gap

**Blocks:** PR 1A (pipeline stages), upload flow design

iPhone users (primary target) shoot in HEIC by default. `exifr` can read EXIF from HEIC files, but browser canvas / OffscreenCanvas cannot decode HEIC for thumbnail generation in Chrome or Firefox — only Safari on Apple devices handles it natively.

**Decision needed:**
- Do we ship a WASM-based HEIC decoder (e.g. `libheif-js`) to handle this universally?
- Do we detect HEIC and show a clear error, asking the user to convert first?
- Do we rely on Safari-only support for now and accept that Chrome users on iPhone cannot use the app?

**Investigation required before PR 1A:** test HEIC upload end-to-end in Chrome on iOS and on desktop to confirm the exact failure mode.

---

## 2. Memory Pressure and Performance on Mobile

**Blocks:** PR 1C (thumbnail generation), overall pipeline strategy

The primary device is mobile. Two concerns:

- **Memory:** storing thumbnail data URLs as strings in RAM (~40KB × N photos) works on desktop but iOS Safari reclaims memory aggressively under pressure. 2,000 photos = ~80MB of thumbnail strings alone.
- **Performance:** Phase 1B (thumbnail generation, quality scoring) on a mid-range mobile browser without GPU acceleration could take several minutes, making the app feel broken.

**Decision needed:**
- What is the acceptable processing time ceiling for 500 photos on mobile?
- Should thumbnails be stored in IndexedDB rather than in-memory data URLs, trading speed for lower peak RAM?
- Should we target a lower thumbnail resolution on mobile (200px vs 400px) to cut memory use in half?

**Investigation required before PR 1C:** benchmark thumbnail generation and memory usage on a real mid-range iPhone (e.g. iPhone 12 or equivalent) with 200 and 500 photos.

---

## 3. Favourite Photo Metadata as Selection Signal

**Blocks:** heroSelect strategy design, Story Skeleton schema

Modern phones mark photos as "favourited" by the user (iOS Heart, Google Photos star). This metadata may be embedded in EXIF or sidecar files. If reliably readable, it is a strong zero-effort signal for hero selection — the user has already told the phone which photos matter most.

**Decision needed:**
- Does `exifr` expose iOS/Google favourite flags?
- How do we weight a favourited photo vs. quality score vs. survey highlight day?
- Should `favourited: bool` be a first-class field in the PhotoData model?

---

## 4. "Favourite Moment" Survey Question + Agent Interpretation

**Blocks:** survey design (PR 1B), Phase 5A agent design

The survey currently asks "Any days that were special?" as a multi-select over dates. A richer alternative: ask "What was your favourite moment of the trip?" as free text, then use an LLM agent to map the answer to specific photos and chapters.

**Two-tier approach:**
- **MVP (PR 1B):** structured question only — prompted pick from chapter list, immediately actionable for pipeline weighting, no LLM required
- **Post-MVP (PR 5A):** accept free text ("the morning we hiked to the waterfall"), interpret via agent with tools (`search_chapters_by_date`, `search_chapters_by_location`, `get_photo_metadata`), return structured selection weights

The free-text path is also a core learning exercise: using an LLM as a translator between natural language intent and structured pipeline config.

Open questions:
- What is the single best structured MVP question? Options: "Which day was your favourite?" (date picker), "What kind of trip was this?" (trip type), "Who should appear most?" (placeholder for face detection)
- How does the free-text agent interact with the favourited photo metadata signal (item 3 above)?

**Decision needed before PR 1B:** confirm the 1 MVP question and what pipeline behaviour it drives.
