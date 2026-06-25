import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import uploadRouter from './routes/upload.js';
import itineraryRouter from './routes/itinerary.js';
import storyRouter from './routes/story.js';
import aestheticRouter from './routes/aesthetic.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

// In-memory store
app.locals.store = {
  photos: [],
  itinerary: null,
  chapters: null,
};

app.use(cors());
// Vision aesthetic scoring can carry several base64-encoded 512px JPEGs per
// request — bump the body limit so a cluster's worth of thumbnails fits.
app.use(express.json({ limit: '25mb' }));

// Serve uploaded photos
app.use('/api/photos', express.static(path.join(__dirname, 'uploads')));

// API routes
app.use('/api/upload', uploadRouter);
app.use('/api/itinerary', itineraryRouter);
app.use('/api/story', storyRouter);
app.use('/api/aesthetic', aestheticRouter);

app.listen(PORT, () => {
  console.log(`Unkept server running on http://localhost:${PORT}`);
});
