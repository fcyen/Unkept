import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import { extractBatch } from '../lib/exif.js';

const router = Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.resolve('uploads'));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = crypto.randomUUID();
    cb(null, `${name}${ext}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|heic|heif|webp|tiff)$/i;
    if (allowed.test(path.extname(file.originalname))) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.originalname}`));
    }
  },
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB per file
});

// POST /api/upload — upload multiple photos
router.post('/', upload.array('photos', 500), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No photos uploaded' });
    }

    const photoMeta = await extractBatch(req.files);

    // Store in app-level state
    const store = req.app.locals.store;
    store.photos = photoMeta;

    res.json({
      count: photoMeta.length,
      photos: photoMeta.map((p) => ({
        filename: p.filename,
        originalName: p.originalName,
        timestamp: p.timestamp,
      })),
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
