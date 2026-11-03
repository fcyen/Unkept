# AI Aesthetic Scoring Proxy

Node/Express proxy that fronts a vision-capable LLM (OpenAI-compatible API)
and returns a per-photo keeper score. The pipeline calls it as a stage that
runs after clustering, attaching `aestheticScore`, `aestheticKeep`, and
`aestheticReason` to each photo so `heroSelect` can pick the best shot in a
cluster — the one where everyone's eyes are open, even if the marginally
sharper frame next to it has someone blinking.

## Why a proxy

The vision API key shouldn't ship in the browser bundle. The proxy keeps
the key server-side and lets us swap providers without touching the
client: same OpenAI SDK code path works for any OpenAI-compatible
endpoint. Develop on cheap models (Kimi K2 Vision), demo on stronger ones
(GPT-4o-mini) — just change env vars.

The pipeline stage `aestheticScore.js` only ever sends ≤512px JPEG
thumbnails. The original `File` bytes stay in the browser.

## Prerequisites

- Node 18+ (the server's `package.json` baseline)
- An OpenAI-compatible vision endpoint + API key

## Setup

```bash
cd server
npm install
```

This pulls in `openai`, the SDK used to talk to any OpenAI-compatible API.

Create `server/.env` (gitignored) with your provider settings:

```bash
# Kimi (Moonshot) — cheap dev path
LLM_BASE_URL=https://api.moonshot.ai/v1
LLM_API_KEY=sk-...
LLM_MODEL=moonshot-v1-8k-vision-preview

# Or GPT-4o-mini — demo path
# LLM_BASE_URL=https://api.openai.com/v1
# LLM_API_KEY=sk-...
# LLM_MODEL=gpt-4o-mini
```

### Optional: a second model for side-by-side comparison

Configure a second provider to score every photo against two models at once.
The `/pipeline` view then shows both results side by side when you select a
photo — useful for comparing, say, GPT-4o-mini against Kimi on the same shot.

```bash
# Provider A (primary — drives heroSelect)
LLM_BASE_URL=https://api.openai.com/v1
LLM_API_KEY=sk-...
LLM_MODEL=gpt-4o-mini

# Provider B (comparison only — optional)
LLM_BASE_URL_2=https://api.moonshot.ai/v1
LLM_API_KEY_2=sk-...
LLM_MODEL_2=moonshot-v1-8k-vision-preview
```

Provider A stays authoritative: only its score feeds hero selection. Provider
B is purely a visible A/B contrast. Leave the `_2` vars unset to run a single
model exactly as before.

Start the server:

```bash
cd server
node --env-file=.env index.js
```

Sanity-check the proxy:

```bash
curl http://localhost:3001/api/aesthetic/health
# {"status":"ok","models":["moonshot-v1-8k-vision-preview"]}
```

If no provider is configured (`LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL`
all missing), the health endpoint returns `503 unconfigured` and the
pipeline stage falls back cleanly.

## Enabling the stage

Aesthetic scoring is off by default — flip `FEATURES.aestheticScoring` to
`true` in `client/src/config.js` (or pass `useAestheticScoring: true` to
`runPhase1` in a test). With the flag on and the proxy reachable, the
debug `/pipeline` route shows scores and reasons per photo and the hero
picks shift to reflect them.

## How the pipeline uses it

```
EXIF → Dedup → [Embedding] → Cluster → [Aesthetic] → Hero → Chapters → Thumbnail → Quality
                                            ↑
                                Only when FEATURES.aestheticScoring is on
                                and the proxy is up
```

The stage uses a **cost pre-filter**: per cluster, it computes a cheap
Laplacian variance on a 128px canvas and keeps the top-3 candidates by
sharpness. Only those candidates are encoded to 512px JPEGs and posted to
the proxy. Small clusters (≤3 photos) are sent whole.

## Caching

Vision scores are deterministic for a given `(model, prompt, image)`, and the
`/pipeline` dev loop re-scores the same sample images on every run. The proxy
caches each result content-addressed by `sha256(model + prompt + image data)`,
so a re-run is a cache hit and never re-bills the LLM. Each cached model card
shows a small `cached` tag in the comparison view.

- The cache persists to `server/.aesthetic-cache.json` (gitignored) so it
  survives server restarts. Writes are debounced and atomic (temp file +
  rename).
- Only successful parses are cached — a model timeout or unparseable response
  is retried on the next run.
- Including the model name and prompt in the key means a **provider swap or a
  prompt edit invalidates automatically** (the new key simply misses).
- `GET /api/aesthetic/health` reports the current entry count as `cached`.
- To force a full re-score, use the **Clear cache** button on the `/pipeline`
  aesthetic stage, `DELETE /api/aesthetic/cache`, or delete
  `server/.aesthetic-cache.json` and restart.

## API reference

### `GET /api/aesthetic/health`

Returns `{"status": "ok", "models": ["...", ...], "cached": <n>}` listing the
configured models and the number of cached scores when at least one provider
is set, `{"status": "unconfigured", "models": []}` (503) otherwise.

### `DELETE /api/aesthetic/cache`

Clears the score cache (in memory and the persisted file). Returns
`{"status": "ok", "cached": 0}`. Backs the **Clear cache** button on the
`/pipeline` aesthetic stage.

### `POST /api/aesthetic`

**Request:**
```json
{
  "photos": [
    { "id": "photo_0", "data": "data:image/jpeg;base64,..." },
    { "id": "photo_1", "data": "data:image/jpeg;base64,..." }
  ]
}
```

**Response:**
```json
{
  "scores": [
    {
      "id": "photo_0",
      "models": [
        { "model": "gpt-4o-mini", "score": 0.82, "keep": true,  "reason": "sharp face, eyes open" },
        { "model": "moonshot-v1-8k-vision-preview", "score": 0.69, "keep": false, "reason": "slightly soft" }
      ]
    },
    {
      "id": "photo_1",
      "models": [
        { "model": "gpt-4o-mini", "score": 0.41, "keep": false, "reason": "motion blur" },
        { "model": "moonshot-v1-8k-vision-preview", "score": null, "keep": null, "reason": "",
          "error": { "kind": "rate_limit", "status": 429, "retryAfter": 20, "message": "Provider rate limit (429)" } }
      ]
    }
  ]
}
```

Each entry is the per-photo result, with one slot per configured model
(`models[0]` is the primary provider). A failed model keeps its slot with
`score: null` and an `error` of kind `rate_limit` (HTTP 429) or `failed`
(timeout, unparseable reply, other provider error). The batch never 500s,
and errors are never cached. The error carries only a status, a coarse kind
and a short message, with anything key-shaped redacted, so it is safe to
render in the UI.

## Rate limits, batching and errors

Kimi rejects bursts above a few concurrent requests with 429. Two guards
keep a run under that limit:

- **Client batching.** The stage posts candidates in batches of 4, one batch
  at a time. If a whole batch fails (for example the proxy itself returns
  429), only those photos are marked with `aestheticError` and the remaining
  batches still run.
- **Per-provider concurrency cap.** The proxy queues calls per provider and
  allows at most `LLM_CONCURRENCY` in flight (default 2).

`/pipeline` turns each outcome into a visible state rather than a silent
null: a per-card message for a rate-limited or failed model, a stage-level
warning for partial failures, and an error when every request failed. The
copy lives in `client/src/dev/pipelineStates.js`.

## Demo mode and the fixture

`DEMO_MODE=true` on the client (`npm run demo`, and every Netlify build)
makes `/pipeline` replay `client/public/demo/pipeline-fixture.json`. In that
mode the aesthetic and embedding stages return before any network I/O.
`DEMO_MODE=true` on the server disables the proxy completely.

Cache keys include the exact JPEG bytes the browser encoded. A cache built
in Safari, or in a different Chrome build, never matches the headless
Chromium the generator script uses. So **export from the browser that built
the cache**, with the proxy in cache-only mode:

```bash
# 1. Proxy: serve the cache only. No keys needed; nothing is sent upstream.
cd server
LLM_CACHE_ONLY=true LLM_MODEL=gpt-4o-mini LLM_MODEL_2=moonshot-v1-8k-vision-preview npm run dev

# 2. Client (another terminal): open http://localhost:5173/pipeline in the
#    same browser you used to build the cache.
cd client && npm run dev:debug
```

When the run finishes, click **Export demo fixture** in the header. The
status next to it reports how many model scores came from the cache
(`14 hits · 0 misses`). Move the downloaded file to
`client/public/demo/pipeline-fixture.json`, then rebuild with
`npm run build:demo`.

In cache-only mode a miss is returned as `not_cached` and is never re-scored,
so the export costs nothing even if some photos aren't cached.
`LLM_MODEL` / `LLM_MODEL_2` must be the exact names the cache was built
with, primary first, because they are part of the key.

**Headless alternative** (only when the cache was built in Chromium):

```bash
cd client
npm run demo:fixture -- --cache ../server/.aesthetic-cache.json --models gpt-4o-mini,moonshot-v1-8k-vision-preview
```

The script runs the same export code in headless Chromium. It answers model
requests only from the cache file and aborts every other outbound request.
Add `--semantic` with the CLIP server running to include semantic clusters.

## Prompt

The proxy uses a terse, JSON-forced prompt aimed at low-token responses:

```
Score a single photo for keep-worthiness in a personal year-in-review slideshow.
Consider: subject clarity, expressions (eyes open, faces visible), composition, lighting.
Penalize: motion blur, closed eyes, awkward crops, busy backgrounds.

Respond with ONLY strict JSON, no prose or fences:
{"score": <0..1>, "keep": <true|false>, "reason": <string, <=12 words>}
```

Markdown-fenced JSON (some models still wrap responses in ```` ```json ````
fences despite the instruction) is unwrapped before parsing.

## Troubleshooting

**`Connection refused` from the pipeline** — the server isn't running.
The aesthetic stage logs a warning and skips. `heroSelect` falls back to
its existing logic.

**`503 unconfigured`** — `LLM_BASE_URL` or `LLM_API_KEY` not set.
Populate `server/.env`.

**`openai package not installed`** — run `npm install` inside `server/`.

**All scores come back null but health is ok** — likely a provider issue
(rate limit, JSON parse failure, or the model doesn't accept the
`image_url` content shape). Check `server` logs for the per-photo
warnings.

**Swapping providers** — change `LLM_BASE_URL`, `LLM_API_KEY`, and
`LLM_MODEL` in `server/.env` and restart the server. No code edit needed.

**Only one model shows in the comparison** — the second provider's `_2`
vars aren't all set, or that provider is erroring. The panel renders
whatever models returned a score; check `server` logs for per-provider
warnings.
