import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

const IMAGE_EXTS = /\.(jpe?g|png|gif|webp|heic|avif|tiff?)$/i;

/**
 * Virtual module `virtual:sample-images` — only active in debug mode.
 *
 * Reads public/sample-images/ at serve/build time and exports the list of
 * public URLs (e.g. ["/sample-images/foo.jpg", ...]). The debug route fetches
 * these URLs and converts them to File objects to auto-seed the pipeline.
 *
 * The list is baked in at build time, so adding files requires a dev server
 * restart (or a new debug build).
 */
function sampleImagesPlugin() {
  const virtualId = 'virtual:sample-images';
  const resolvedId = '\0' + virtualId;

  return {
    name: 'sample-images',
    resolveId(id) {
      if (id === virtualId) return resolvedId;
    },
    load(id) {
      if (id !== resolvedId) return;
      const dir = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'public/sample-images');
      let files = [];
      try {
        files = fs.readdirSync(dir).filter((f) => IMAGE_EXTS.test(f)).sort();
      } catch {
        // directory missing or unreadable — export empty list
      }
      const urls = files.map((f) => `/sample-images/${f}`);
      return `export default ${JSON.stringify(urls)};`;
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    ...(mode === 'debug' ? [sampleImagesPlugin()] : []),
  ],
}));
