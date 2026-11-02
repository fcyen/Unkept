import { defineConfig, loadEnv } from 'vite';
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

/**
 * Keep the full-resolution sample photos out of every non-debug build.
 * They live in public/ for the /pipeline debug loop, but they carry original
 * EXIF (including exact GPS) and ~50 MB. The public demo only needs the
 * fixture's 320px thumbnails, so nothing references them in production.
 */
function excludeSampleImagesPlugin() {
  let outDir;
  return {
    name: 'exclude-sample-images',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      fs.rmSync(path.join(outDir, 'sample-images'), { recursive: true, force: true });
    },
  };
}

export default defineConfig(({ mode }) => {
  // DEMO_MODE (or VITE_DEMO_MODE) from the shell or a .env file. The public
  // Netlify build sets DEMO_MODE=true in netlify.toml. See src/lib/demoMode.js.
  const env = loadEnv(mode, process.cwd(), '');
  const demoMode = env.DEMO_MODE === 'true' || env.VITE_DEMO_MODE === 'true';
  return {
    define: { __DEMO_MODE__: JSON.stringify(demoMode) },
    plugins: [
      react(),
      // The /pipeline route imports `virtual:sample-images`; it must resolve in
      // debug builds (real samples) and in demo builds (route is mounted there
      // too). Outside debug mode it serves the default public/ folder list.
      ...(mode === 'debug' || demoMode ? [sampleImagesPlugin()] : []),
      ...(mode === 'debug' ? [] : [excludeSampleImagesPlugin()]),
    ],
  };
});
