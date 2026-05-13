import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import uploadRouter from './routes/upload.js';
import itineraryRouter from './routes/itinerary.js';
import storyRouter from './routes/story.js';
import captionRouter from './routes/caption.js';

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
// Captions ship base64 thumbnails (~12–40KB each) in the request body,
// so we need more than the express default 100KB to accept them.
app.use(express.json({ limit: '10mb' }));

// Serve uploaded photos
app.use('/api/photos', express.static(path.join(__dirname, 'uploads')));

// API routes
app.use('/api/upload', uploadRouter);
app.use('/api/itinerary', itineraryRouter);
app.use('/api/story', storyRouter);
app.use('/api/caption', captionRouter);

app.listen(PORT, () => {
  console.log(`Unkept server running on http://localhost:${PORT}`);
});
