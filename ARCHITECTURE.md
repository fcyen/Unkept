# Unkept — Architecture

## Overview

Unkept is a privacy-first web app that transforms a collection of photos (up to 5,000) into a scrollable, editorial-style photo story. It extracts EXIF metadata, generates thumbnails, deduplicates, clusters photos into day-based chapters, and renders a magazine-style narrative — all in the browser.

**Photos never leave the user's device during processing.** Data only leaves on explicit user action (Share, Generate Captions). Deployable as a static site to Vercel/Netlify.

---

## Directory Structure

```
/  (repo root)
├── ARCHITECTURE.md
├── PLAN-v3.md                           # Implementation plan (current)
├── EXECUTIVE_SUMMARY.md                 # Product overview + open questions
├── CLAUDE.md                            # Claude Code guide
├── client/                              # React + Vite + Tailwind
│   ├── index.html
│   ├── vite.config.js
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   └── src/
│       ├── main.jsx
│       ├── App.jsx                      # Root: toggles UploadPage ↔ StoryView
│       ├── index.css                    # Tailwind + fade-in animations
│       ├── lib/
│       │   ├── pipeline/
│       │   │   ├── runner.js            # Chains stages, emits progress events
│       │   │   ├── strategies.js        # Registry of available strategies per stage
│       │   │   └── stages/
│       │   │       ├── dedup.js         # Exact hash + perceptual hash dedup
│       │   │       ├── cluster.js       # Day-based clustering (swappable)
│       │   │       ├── heroSelect.js    # Hero photo picker (swappable)
│       │   │       ├── chapterBuilder.js # Assembles Chapter objects with blocks
│       │   │       └── geocode.js       # Nominatim with caching + progressive update
│       │   └── workers/
│       │       ├── exif.worker.js       # EXIF extraction in Web Worker
│       │       └── thumbnail.worker.js  # Thumbnail generation via OffscreenCanvas
│       └── components/
│           ├── UploadPage.jsx           # Photo upload UI + pipeline trigger
│           ├── StoryView.jsx            # Main story layout (cover + chapters)
│           ├── TableOfContents.jsx      # Inline TOC with chapter list
│           ├── Chapter.jsx              # Single chapter (header + hero + blocks)
│           ├── EditablePhotoLayout.jsx  # Mixed editorial photo layouts
│           └── FadeIn.jsx              # Scroll-triggered fade-in wrapper
├── server/                              # Express server (Phase 2 — captions, sharing)
│   ├── index.js
│   ├── lib/
│   │   ├── exif.js
│   │   └── matcher.js
│   └── routes/
│       ├── upload.js
│       ├── itinerary.js
│       └── story.js
└── sample/                              # (empty — itinerary.json removed in v2)
```

---

## Data Pipeline

```
Photos[] (up to 5,000)
  │
  ▼
┌─────────────────────────────────────────────────────────┐
│  1. EXIF Extraction (Web Worker, batches of 50)         │
│     - exifr.parse() → DateTimeOriginal                  │
│     - exifr.gps()   → latitude, longitude               │
│     - Main thread creates objectUrl                     │
│     Output: PhotoData[] with timestamps + GPS           │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│  2. Thumbnail Generation (Web Worker, OffscreenCanvas)  │
│     - Resize to 400px max dimension                     │
│     - Export as JPEG blob                               │
│     - Main thread creates thumbnailUrl                  │
│     Output: PhotoData[] with thumbnailUrl               │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│  3. Deduplication                                       │
│     - Exact hash: first 64KB + last 64KB + file size    │
│     - Perceptual: 8×8 grayscale average hash            │
│     - Hamming distance ≤ 5 = duplicate                  │
│     Output: PhotoData[] (duplicates removed)            │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│  4. Clustering (swappable strategy)                     │
│     Default "day": group by calendar date               │
│     Photos without timestamps → "Undated" chapter       │
│     Output: PhotoData[][] (array of groups)             │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│  5. Hero Selection (swappable strategy)                 │
│     Default "middle": chronological middle photo        │
│     Output: one PhotoData per group                     │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│  6. Chapter Builder                                     │
│     - Assigns dayIndex, generates "Day N" title         │
│     - Computes median GPS coords per chapter            │
│     - Creates blocks: [text (empty), photos]            │
│     - Sets heroPhoto                                    │
│     Output: Chapter[] → UI renders immediately          │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼  (async, does not block rendering)
┌─────────────────────────────────────────────────────────┐
│  7. Geocoding (progressive)                             │
│     - Round coords to 3 decimal places (~100m)          │
│     - Deduplicate locations across chapters             │
│     - Nominatim API at 1 req/sec                        │
│     - Updates chapter titles: "Day 1" → "Day 1 — Asakusa" │
│     - Generates trip_name from countries + date range   │
│     Output: chapters updated in-place, progressively    │
└─────────────────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│  Render (React components)                              │
│     - Cover page with trip name, date range, stats      │
│     - Table of contents                                 │
│     - Chapters: hero image + block-based content        │
│     - Scroll-triggered fade-in animations               │
│     - Location labels fill in progressively             │
└─────────────────────────────────────────────────────────┘
```

---

## Data Models

### PhotoData
```js
{
  id: "photo_0_IMG_1234.jpg",        // unique identifier
  file: File,                         // original File object
  name: "IMG_1234.jpg",
  timestamp: "2025-03-15T08:30:00Z", // from EXIF, or null
  latitude: 35.6762,                  // from EXIF GPS, or null
  longitude: 139.6503,
  objectUrl: "blob:...",              // full-res blob URL
  thumbnailUrl: "blob:...",           // 400px canvas-generated thumbnail
  hash: "a1b2c3d4...",               // for dedup (exact + perceptual)
  caption: null,                      // string | null — future feature
}
```

### Chapter
```js
{
  id: "chapter_001",
  title: "Day 1 — Asakusa",          // stored, not computed; updatable
  date: "2025-03-15",                 // single date, derived from photos
  dayIndex: 0,                        // 0-based, for "Day N" label

  location: {
    coords: { lat: 35.714, lng: 139.797 }, // median GPS, or null
    label: "Asakusa, Tokyo",               // from Nominatim, null until resolved
    country: "Japan",                      // from Nominatim, null until resolved
  },

  heroPhoto: PhotoData,               // selected by hero selection stage

  blocks: [                           // ordered content blocks
    {
      type: "text",
      id: "blk_001",
      content: "",                    // empty initially, editable placeholder
    },
    {
      type: "photos",
      id: "blk_002",
      photos: PhotoData[],            // all photos for this day
    },
  ],
}
```

### Story
```js
{
  trip_name: "Japan, March 2025",     // auto-generated from countries + date range
  chapters: Chapter[],
}
```

---

## Client-Server Boundary

### Always client-side
- EXIF extraction
- Thumbnail generation
- Duplicate detection
- Clustering and chapter building
- Photo rendering via blob URLs
- All user editing (titles, text blocks)

### Server-side (only on explicit user action)
- **"Generate Captions":** Sends curated thumbnails (~20KB each) + chapter metadata → Claude API proxy
- **"Share":** Uploads curated thumbnails + story data → cloud storage for shareable link

### Server never receives
- Original full-resolution photos
- Rejected duplicates or removed photos
- Any data before explicit user action

---

## Key Design Decisions

| Decision | Rationale |
|---|---|
| Local-first processing | Photos never leave the device during processing; privacy by default |
| Explicit data boundary | Only curated thumbnails + metadata sent on user action |
| Modular pipeline | Pure function stages, swappable strategies, easy to extend |
| Progressive rendering | Chapters render immediately; geocoding fills in async |
| Day-based clustering | Predictable chapters, natural narrative ("Day 1, Day 2...") |
| Block-based chapters | Supports text + photos, future editing capabilities |
| Web Workers | EXIF + thumbnails off main thread, UI stays responsive at 5K photos |
| Coordinate dedup for geocoding | 3 decimal places (~100m) collapses 50+ chapters to ~15 requests |
| No new dependencies | Web Workers, OffscreenCanvas, canvas hashing are all browser APIs |
| No itinerary feature | Removed in v2; can return as a clustering strategy |
| No drag-and-drop | dnd-kit removed; future editing via block-based model |

See `DECISIONS-v2.md` for detailed rationale on each decision.

---

## Performance Targets

| Photos | Expected behavior |
|--------|-------------------|
| 100 | Near-instant processing |
| 500 | Smooth, progress bar visible |
| 2,000 | 10–20s processing, UI stays responsive |
| 5,000 | 30–60s processing, UI stays responsive, progressive geocoding |

---

## Browser Support

Chrome, Firefox, Safari 16.4+ (modern browsers only). No fallbacks for `OffscreenCanvas` or Web Workers.

---

## Dependencies

### Client
| Package | Purpose |
|---|---|
| react, react-dom | UI framework |
| exifr | EXIF metadata extraction (used inside Web Worker) |
| tailwindcss | Utility CSS |
| vite, @vitejs/plugin-react | Build tooling |

### Server (Phase 2)
| Package | Purpose |
|---|---|
| express | HTTP server |
| multer | File upload handling |
| exifr | Server-side EXIF extraction |
| cors | Cross-origin requests |
