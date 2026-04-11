import { Router } from 'express';

const router = Router();

// POST /api/itinerary — set the trip itinerary
router.post('/', (req, res) => {
  try {
    const itinerary = req.body;

    if (!itinerary || !itinerary.events || !Array.isArray(itinerary.events)) {
      return res.status(400).json({ error: 'Invalid itinerary format. Expected { trip_name, events: [...] }' });
    }

    // Validate events
    for (const event of itinerary.events) {
      if (!event.id || !event.date || !event.start_time || !event.end_time) {
        return res.status(400).json({
          error: `Event missing required fields (id, date, start_time, end_time): ${JSON.stringify(event)}`,
        });
      }
    }

    const store = req.app.locals.store;
    store.itinerary = itinerary;

    res.json({ message: 'Itinerary saved', eventCount: itinerary.events.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/itinerary — get current itinerary
router.get('/', (req, res) => {
  const store = req.app.locals.store;
  if (!store.itinerary) {
    return res.status(404).json({ error: 'No itinerary loaded' });
  }
  res.json(store.itinerary);
});

export default router;
