import { Router } from 'express';
import { matchPhotosToEvents } from '../lib/matcher.js';

const router = Router();

// GET /api/story — generate the matched story
router.get('/', (req, res) => {
  const store = req.app.locals.store;

  if (!store.itinerary) {
    return res.status(400).json({ error: 'No itinerary loaded. POST to /api/itinerary first.' });
  }
  if (!store.photos || store.photos.length === 0) {
    return res.status(400).json({ error: 'No photos uploaded. POST to /api/upload first.' });
  }

  const chapters = matchPhotosToEvents(store.photos, store.itinerary);

  // Cache for reorder operations
  store.chapters = chapters;

  res.json({
    trip_name: store.itinerary.trip_name,
    chapters,
  });
});

// PUT /api/story/chapters/:id/reorder — reorder photos within a chapter
router.put('/chapters/:id/reorder', (req, res) => {
  const store = req.app.locals.store;
  const { id } = req.params;
  const { photos } = req.body; // array of filenames in new order

  if (!store.chapters) {
    return res.status(400).json({ error: 'No story generated yet. GET /api/story first.' });
  }

  if (!Array.isArray(photos)) {
    return res.status(400).json({ error: 'Expected { photos: [filename1, filename2, ...] }' });
  }

  const chapter = store.chapters.find((c) => c.id === id);
  if (!chapter) {
    return res.status(404).json({ error: `Chapter ${id} not found` });
  }

  // Validate that the new order contains the same photos
  const existing = new Set(chapter.photos);
  const incoming = new Set(photos);
  if (existing.size !== incoming.size || ![...existing].every((p) => incoming.has(p))) {
    return res.status(400).json({ error: 'Reorder must contain exactly the same photos' });
  }

  chapter.photos = photos;
  // Update hero to middle photo
  chapter.heroPhoto = photos.length > 0 ? photos[Math.floor(photos.length / 2)] : null;

  res.json({ message: 'Reordered', chapter });
});

export default router;
