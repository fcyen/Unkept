#!/usr/bin/env node
/**
 * Capture README screenshots of the DEMO_MODE /pipeline page.
 *
 *   npm run build:demo && node scripts/capture-screenshots.mjs
 *
 * Serves dist/ with `vite preview`, opens /pipeline in headless Chromium and
 * writes PNGs to docs/screenshots/. The model-comparison shot is only taken
 * when the fixture actually contains model scores, so the README never shows
 * placeholder data as if it were a result.
 */
import { preview } from 'vite';
import { createRequire } from 'node:module';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const clientRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(clientRoot, '../docs/screenshots');

async function loadChromium() {
  try { return (await import('playwright')).chromium; } catch { /* fall through */ }
  try { return createRequire(import.meta.url)('playwright').chromium; } catch {
    throw new Error('Playwright not found. Install it with `npm i -D playwright && npx playwright install chromium`.');
  }
}

const fixture = JSON.parse(await readFile(resolve(clientRoot, 'dist/demo/pipeline-fixture.json'), 'utf8'));
const hasModels = (fixture.meta?.models?.length ?? 0) >= 2;

await mkdir(outDir, { recursive: true });
const server = await preview({ root: clientRoot, preview: { port: 0 }, logLevel: 'warn' });
const origin = server.resolvedUrls.local[0].replace(/\/$/, '');
const chromium = await loadChromium();
const browser = await chromium.launch();
try {
  const shoot = async (name, viewport, stage, { full = false, selectFirst = false, clip } = {}) => {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`${origin}/pipeline`);
    await page.waitForSelector('nav[aria-label="Pipeline stages"]');
    if (stage) await page.locator('nav button', { hasText: stage }).first().click();
    if (selectFirst) await page.locator('main button[aria-pressed]').first().click();
    await page.waitForTimeout(300);
    const target = clip ? page.locator(clip) : page;
    await target.screenshot({ path: resolve(outDir, name), ...(clip ? {} : { fullPage: full }) });
    console.log('wrote', name);
    await page.close();
  };
  const laptop = { width: 1366, height: 900 };
  if (hasModels) {
    await shoot('comparison.png', laptop, 'Aesthetic');
    await shoot('comparison-mobile.png', { width: 390, height: 844 }, 'Aesthetic', { full: true });
  } else {
    console.log('Fixture has no model scores — skipping comparison shots.');
  }
  await shoot('dedup.png', laptop, 'Dedup', { selectFirst: true });
  await shoot('pipeline-mobile.png', { width: 390, height: 844 }, 'Cluster');
} finally {
  await browser.close();
  server.httpServer.close();
}
