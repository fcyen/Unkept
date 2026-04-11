import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import uploadRouter from './routes/upload.js';
import itineraryRouter from './routes/itinerary.js';
import storyRouter from './routes/story.js';

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
app.use(express.json({ limit: '10mb' }));

// Serve uploaded photos
app.use('/api/photos', express.static(path.join(__dirname, 'uploads')));

// API routes
app.use('/api/upload', uploadRouter);
app.use('/api/itinerary', itineraryRouter);
app.use('/api/story', storyRouter);

app.listen(PORT, () => {
  console.log(`PhotoStory server running on http://localhost:${PORT}`);
});
