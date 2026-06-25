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

Start the server:

```bash
cd server
node --env-file=.env index.js
```

Sanity-check the proxy:

```bash
curl http://localhost:3001/api/aesthetic/health
# {"status":"ok","model":"moonshot-v1-8k-vision-preview"}
```

If `LLM_BASE_URL` or `LLM_API_KEY` is missing, the health endpoint
returns `503 unconfigured` and the pipeline stage falls back cleanly.

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

## API reference

### `GET /api/aesthetic/health`

Returns `{"status": "ok", "model": "..."}` when configured,
`{"status": "unconfigured", "model": null}` (503) otherwise.

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
    { "id": "photo_0", "score": 0.82, "keep": true,  "reason": "sharp face, eyes open" },
    null
  ]
}
```

Each entry is the per-photo result (or `null` on individual error). The
batch never 500s — a model timeout or JSON-parse failure on one photo
yields `null` for that slot and the others go through.

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
