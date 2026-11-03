#!/usr/bin/env node
/**
 * Build the DEMO_MODE fixture: public/demo/pipeline-fixture.json
 *
 * Runs the real selection pipeline on the bundled sample images in headless
 * Chromium (the same code path as /pipeline in debug mode), then serialises
 * every stage's snapshot plus small display thumbnails.
 *
 * Zero API cost by construction — every request the page makes is
 * intercepted:
 *   - Vision model calls (localhost:3001/api/aesthetic) are answered ONLY
 *     from the score cache file you pass. Nothing is forwarded to a provider;
 *     a cache miss is recorded as `not_cached`, not re-scored.
 *   - The CLIP embedding server (localhost:8000, free and local) is allowed
 *     only with --semantic.
 *   - Any other non-dev-server request is aborted.
 *
 * Usage (from client/):
 *   npm run demo:fixture -- \
 *     --cache ../server/.aesthetic-cache.json \
 *     --models gpt-4o-mini,moonshot-v1-8k-vision-preview \
 *     [--semantic] [--out public/demo/pipeline-fixture.json]
 *
 * --models must list the exact model names the cache was built with, primary
 * first (they are part of the cache key). Defaults to $LLM_MODEL,$LLM_MODEL_2.
 * Without --cache the fixture still has every classical stage; the model
 * comparison renders an explained "not bundled" state.
 */
import { createServer } from 'vite';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lookupCached } from '../../server/lib/aestheticCache.js';

const here = dirname(fileURLToPath(import.meta.url));

// Playwright isn't a project dependency (it's only needed to regenerate the
// fixture). Resolve a local or global install; explain how to get one if not.
async function loadChromium() {
  try {
    return (await import('playwright')).chromium;
  } catch {
    try {
      return createRequire(import.meta.url)('playwright').chromium;
    } catch {
      throw new Error('Playwright not found. Install it once with `npm i -D playwright && npx playwright install chromium`.');
    }
  }
}
const clientRoot = resolve(here, '..');

function parseArgs(argv) {
  const args = { semantic: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--semantic') args.semantic = true;
    else if (a === '--cache') args.cache = argv[++i];
    else if (a === '--models') args.models = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(await readFile(fileURLToPath(import.meta.url), 'utf8').then((s) => s.split('*/')[0]));
    return;
  }
  const out = resolve(clientRoot, args.out ?? 'public/demo/pipeline-fixture.json');
  const models = (args.models ?? [process.env.LLM_MODEL, process.env.LLM_MODEL_2].filter(Boolean).join(','))
    .split(',').map((m) => m.trim()).filter(Boolean);

  let cache = null;
  if (args.cache) {
    cache = JSON.parse(await readFile(resolve(process.cwd(), args.cache), 'utf8'));
    if (models.length === 0) {
      throw new Error('--cache needs --models (the exact model names the cache was built with).');
    }
    console.log(`Loaded ${Object.keys(cache).length} cached score(s); models: ${models.join(', ')}`);
  } else {
    console.log('No --cache given: the model comparison will be marked "not bundled".');
  }

  // Never let the capture build itself run in demo mode — we need the real pipeline.
  delete process.env.DEMO_MODE;
  delete process.env.VITE_DEMO_MODE;
  const server = await createServer({
    root: clientRoot,
    mode: 'debug',
    logLevel: 'warn',
    server: { port: 0, strictPort: false },
  });
  await server.listen();
  const origin = server.resolvedUrls.local[0].replace(/\/$/, '');
  const devHost = new URL(origin).host;

  const chromium = await loadChromium();
  const browser = await chromium.launch();
  let hits = 0;
  let misses = 0;
  let blocked = [];
  try {
    const page = await browser.newPage();
    page.on('pageerror', (e) => console.error('[page error]', e.message));

    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.host === devHost || url.protocol === 'data:' || url.protocol === 'blob:') return route.continue();

      if (url.host === 'localhost:3001' && url.pathname === '/api/aesthetic/health') {
        // Always "healthy" so the stage runs its real pre-filter and records
        // which photos would be sent; scores then come only from the cache.
        return route.fulfill({ json: { status: 'ok', models, cached: cache ? Object.keys(cache).length : 0 } });
      }
      if (url.host === 'localhost:3001' && url.pathname === '/api/aesthetic' && route.request().method() === 'POST') {
        const { photos } = JSON.parse(route.request().postData() || '{}');
        const scores = (photos ?? []).map((item) => lookupCached(cache ?? {}, models, item));
        return route.fulfill({ json: { scores } });
      }
      if (args.semantic && url.host === 'localhost:8000') return route.continue();

      blocked.push(`${url.host}${url.pathname}`);
      return route.abort();
    });

    await page.goto(`${origin}/pipeline${args.semantic ? '?semantic=1' : ''}`);
    console.log('Running the pipeline in headless Chromium…');
    await page.waitForFunction(() => window.__pipelineSnapshots || window.__pipelineError, null, { timeout: 10 * 60_000 });
    const pipelineError = await page.evaluate(() => window.__pipelineError ?? null);
    if (pipelineError) throw new Error(`Pipeline failed: ${pipelineError}`);

    // Same code path as the "Export demo fixture" button (src/dev/demoFixture.js).
    await page.waitForFunction(() => typeof window.__exportDemoFixture === 'function');
    const fixture = await page.evaluate(() => window.__exportDemoFixture('scripts/build-demo-fixture.mjs'));
    hits = fixture.meta.source.cacheHits;
    misses = fixture.meta.source.cacheMisses;
    const photoCount = fixture.meta.photoCount;
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, JSON.stringify(fixture));
    const kb = Math.round(JSON.stringify(fixture).length / 1024);
    console.log(`Wrote ${out} (${kb} KB): ${photoCount} photos, cache hits ${hits}, misses ${misses}.`);
    if (blocked.length) console.log(`Blocked ${blocked.length} outbound request(s):`, [...new Set(blocked)].join(', '));
    if (cache && hits === 0) {
      console.warn('No cache hits. Cache keys include the exact JPEG bytes the browser encoded, so a cache built in another browser (or Chrome build) never matches headless Chromium. Export from the browser that built the cache instead: see "Demo mode and the fixture" in docs/ai-aesthetic-proxy.md.');
    }
  } finally {
    await browser.close();
    await server.close();
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
