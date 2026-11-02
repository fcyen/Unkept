/**
 * DEMO_MODE — public portfolio build switch.
 *
 * Set `DEMO_MODE=true` (or `VITE_DEMO_MODE=true`) in the build env. Vite
 * inlines it as the `__DEMO_MODE__` literal (see vite.config.js), so the
 * guarded branches below are resolved at build time.
 *
 * When on:
 *   - `/pipeline` renders precomputed results from
 *     `public/demo/pipeline-fixture.json` instead of running the pipeline.
 *   - The aesthetic (vision LLM) and embedding (CLIP) stages make no network
 *     calls at all — they return null scores immediately. Nothing can reach
 *     OpenAI, Moonshot/Kimi or any other paid API, keys or no keys.
 *   - Model votes persist to localStorage only.
 */
// eslint-disable-next-line no-undef
export const DEMO_MODE = typeof __DEMO_MODE__ !== 'undefined' && __DEMO_MODE__ === true;

export const DEMO_FIXTURE_URL = '/demo/pipeline-fixture.json';
