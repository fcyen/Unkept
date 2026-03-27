# PhotoStory — Architecture

## Overview

PhotoStory is a fully client-side web app that transforms a collection of photos into a scrollable, editorial-style photo story. It extracts EXIF metadata (timestamps, GPS) from photos in the browser, groups them into chapters (via itinerary matching or auto-clustering), and renders a magazine-style narrative.

**No server required.** Everything runs in the browser. Deployable as a static site to Vercel/Netlify.

---

## Directory Structure

```
photostory/
├── client/                          # React + Vite + Tailwind
│   ├── index.html                   # Entry point (loads Google Fonts)
│   ├── vite.config.js
│   ├── tailwind.config.js           # Custom theme: cream, ink, serif/sans fonts
│   ├── postcss.config.js
│   └── src/
│       ├── main.jsx                 # React entry
│       ├── App.jsx                  # Root: toggles UploadPage ↔ StoryView
│       ├── index.css                # Tailwind + fade-in animations
│       ├── lib/
│       │   ├── exif.js              # EXIF extraction (timestamps + GPS)
│       │   ├── thumbnails.js        # Canvas-based thumbnail generation
│       │   ├── matcher.js           # Photo → chapter matching engine
│       │   └── geocode.js           # Reverse geocoding via Nominatim
│       └── components/
│           ├── UploadPage.jsx       # Photo + itinerary upload UI
│           ├── StoryView.jsx        # Main story layout (cover + chapters)
│           ├── TableOfContents.jsx  # Inline TOC with chapter list
│           ├── Chapter.jsx          # Single chapter (header + hero + grid)
│           ├── EditablePhotoLayout.jsx  # Mixed editorial layouts + drag reorder
│           └── FadeIn.jsx           # Scroll-triggered fade-in wrapper
├── server/                          # Express server (unused in static deploy)
│   ├── index.js                     # Express app
│   ├── lib/
│   │   ├── exif.js                  # Server-side EXIF extraction
│   │   └── matcher.js               # Server-side matching
│   └── routes/
│       ├── upload.js                # POST /api/upload
│       ├── itinerary.js             # POST/GET /api/itinerary
│       └── story.js                 # GET /api/story, PUT reorder
└── sample/
    └── itinerary.json               # Sample 2-day Tokyo trip
```

---

## Data Pipeline

```
┌─────────────────────────────────────────────────────────┐
│  User selects photos + itinerary mode                   │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│  1. EXIF Extraction (lib/exif.js)                       │
│     - exifr.parse() → DateTimeOriginal                  │
│     - exifr.gps()   → latitude, longitude               │
│     - Creates objectUrl via URL.createObjectURL()       │
│     Output: PhotoData[]                                 │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│  2. Thumbnail Generation (lib/thumbnails.js)            │
│     - Draws each photo to <canvas> at 400px max         │
│     - Exports as JPEG blob → thumbnailUrl               │
│     - Grid uses thumbnails; hero uses full objectUrl    │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│  3. Matching Engine (lib/matcher.js)                    │
│     With itinerary:                                     │
│       - Match photo timestamps to event time windows    │
│       - Unmatched → "Other Moments" chapter             │
│     Without itinerary:                                  │
│       - Sort by timestamp, group by date                │
│       - Split clusters on 45-min gaps                   │
│       - Label by time of day (Morning, Afternoon, etc.) │
│     Output: Chapter[]                                   │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│  4. Reverse Geocoding (lib/geocode.js)                  │
│     - For each chapter, take median photo's GPS coords  │
│     - Call Nominatim API → city, neighbourhood, country │
│     - Rate-limited to 1 req/sec                         │
│     - Country used to build album title                 │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│  5. Render (React components)                           │
│     - Cover page with trip name, date range, stats      │
│     - Table of contents                                 │
│     - Chapters: hero image + mixed editorial layouts    │
│     - Drag-to-reorder within chapters (@dnd-kit)        │
│     - Scroll-triggered fade-in animations               │
└─────────────────────────────────────────────────────────┘
```

---

## Data Models

### PhotoData
```js
{
  id: "photo_0_IMG_1234.jpg",  // unique identifier
  file: File,                   // original File object
  name: "IMG_1234.jpg",
  timestamp: "2025-03-15T08:30:00.000Z",  // from EXIF, or null
  latitude: 35.6762,            // from EXIF GPS, or null
  longitude: 139.6503,
  objectUrl: "blob:...",        // full-res blob URL
  thumbnailUrl: "blob:...",     // 400px canvas-generated thumbnail
}
```

### Chapter
```js
{
  id: "evt_001",                // event ID or "auto_1" / "other_moments"
  activity: "Visit Senso-ji Temple",
  venue: "Senso-ji, Asakusa",   // from itinerary, or empty
  location: "Asakusa, Tokyo",   // from reverse geocoding, or null
  date: "2025-03-15",
  start_time: "10:00",
  end_time: "12:00",
  photos: PhotoData[],
  heroPhoto: PhotoData,          // middle photo in sorted array
  photoCount: 12,
}
```

### Story
```js
{
  trip_name: "Japan, March 2025",  // auto-generated or from itinerary
  chapters: Chapter[],
}
```

---

## Key Design Decisions

| Decision | Rationale |
|---|---|
| Fully client-side | No server needed for MVP; deployable as static site; photos never leave user's device |
| `URL.createObjectURL()` for photos | Avoids uploading; renders directly from local files |
| Canvas thumbnails (400px) | Grid uses small images to save memory; hero uses full-res |
| `exifr` for EXIF | Lightweight, browser-native, reads only headers (not full file) |
| Nominatim for geocoding | Free, no API key, sufficient for prototype |
| Separate `exifr.parse()` + `exifr.gps()` | The `pick` option restricts to named tags only; GPS requires its own call |
| 45-min gap for auto-clustering | Heuristic that works well for travel photos |
| @dnd-kit for reorder | Lightweight, React-native drag-and-drop |
| Playfair Display + Inter | Editorial serif/sans pairing |

---

## Performance Considerations

| Photos | Desktop | Mobile |
|--------|---------|--------|
| ~100 | Smooth | Smooth |
| ~300 | Fine | Sluggish |
| 500+ | OK with lazy loading | May crash tab |

**Mitigations in place:**
- Canvas thumbnails (400px JPEG) for grid — ~20KB each vs 5MB originals
- Native `loading="lazy"` on grid images
- Scroll-triggered rendering via IntersectionObserver
- Photos saved to disk on server path (if using server mode)

---

## Future Architecture (Phase 2)

```
┌──────────┐     ┌───────────┐     ┌──────────────┐
│  Client   │────▶│  Backend   │────▶│  Cloud Store  │
│  (Vite)   │     │  (Express) │     │  (R2 / S3)    │
└──────────┘     └─────┬──────┘     └──────────────┘
                       │
                       ▼
                ┌──────────────┐
                │  Vision LLM   │
                │  (Claude API) │
                └──────────────┘

New capabilities:
- Server-side thumbnail generation (handles 500+ photos)
- Vision LLM for witty captions and quality-based photo curation
- Duplicate detection via perceptual hashing
- Blur/exposure quality scoring
- Shareable story links with cloud storage
- Itinerary parsing from PDF / Google Calendar / plain text
```

---

## Dependencies

### Client
| Package | Purpose |
|---|---|
| react, react-dom | UI framework |
| exifr | EXIF metadata extraction in browser |
| @dnd-kit/core, sortable, utilities | Drag-and-drop reorder |
| tailwindcss | Utility CSS |
| vite, @vitejs/plugin-react | Build tooling |

### Server (unused in static deploy)
| Package | Purpose |
|---|---|
| express | HTTP server |
| multer | File upload handling |
| exifr | Server-side EXIF extraction |
| cors | Cross-origin requests |
