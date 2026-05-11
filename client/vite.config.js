import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import os from 'os';
import path from 'path';

const IMAGE_EXTS = /\.(jpe?g|png|gif|webp|heic|avif|tiff?)$/i;

const MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.heic': 'image/heic',
  '.avif': 'image/avif',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
};

function expandHome(p) {
  if (!p) return p;
  if (p === '~') return os.homedir();
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

/**
 * Virtual module `virtual:sample-images` — only active in debug mode.
 *
 * Exports the list of sample image URLs the debug route can fetch. By default
 * reads `client/public/sample-images/` (served by Vite's static handler). If
 * `SAMPLE_IMAGES_DIR` is set (via `npm run dev:debug -- /path/to/folder`),
 * reads that folder instead and serves files via a dev-server middleware
 * mounted at `/sample-images/`.
 *
 * The list is baked in at build time, so adding files requires a dev server
 * restart (or a new debug build).
 */
function sampleImagesPlugin() {
  const virtualId = 'virtual:sample-images';
  const resolvedId = '\0' + virtualId;
  const projectDir = path.dirname(new URL(import.meta.url).pathname);
  const defaultDir = path.resolve(projectDir, 'public/sample-images');
  const customDir = process.env.SAMPLE_IMAGES_DIR
    ? path.resolve(expandHome(process.env.SAMPLE_IMAGES_DIR))
    : null;
  const dir = customDir || defaultDir;

  return {
    name: 'sample-images',
    resolveId(id) {
      if (id === virtualId) return resolvedId;
    },
    load(id) {
      if (id !== resolvedId) return;
      let files = [];
      try {
        files = fs.readdirSync(dir).filter((f) => IMAGE_EXTS.test(f)).sort();
      } catch {
        // directory missing or unreadable — export empty list
      }
      const urls = files.map((f) => `/sample-images/${encodeURIComponent(f)}`);
      return [
        `export default ${JSON.stringify(urls)};`,
        `export const sampleImagesDir = ${JSON.stringify(dir)};`,
      ].join('\n');
    },
    configureServer(server) {
      if (!customDir) return; // public/ default handled by Vite's built-in static middleware
      server.middlewares.use('/sample-images', (req, res, next) => {
        try {
          const name = decodeURIComponent((req.url || '').split('?')[0].replace(/^\//, ''));
          if (!name || name.includes('/') || name.includes('\\') || name.includes('..')) {
            return next();
          }
          const full = path.join(dir, name);
          if (path.dirname(full) !== dir) return next();
          fs.stat(full, (err, stat) => {
            if (err || !stat.isFile()) return next();
            const mime = MIME[path.extname(name).toLowerCase()] || 'application/octet-stream';
            res.setHeader('Content-Type', mime);
            res.setHeader('Content-Length', String(stat.size));
            fs.createReadStream(full).on('error', next).pipe(res);
          });
        } catch (e) {
          next(e);
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    ...(mode === 'debug' ? [sampleImagesPlugin()] : []),
  ],
}));
