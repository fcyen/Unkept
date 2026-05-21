# Unkept local server

Single FastAPI process that hosts the AI-backed parts of the Unkept pipeline:

| Endpoint | Phase | When |
|---|---|---|
| `POST /embed` | Phase 1 (selection) | CLIP ViT-B/32 image embeddings for `clusterSemantic.js`. Always-on once the model loads. |
| `POST /caption` | Phase 3 (PR3A) | Per-chapter Wrapped-style captions via Claude. Only active when `ANTHROPIC_API_KEY` is set and the user opts in. |

The browser only ever sends curated thumbnails to this server. Full-resolution
photos never leave the device. The server itself runs on `localhost`; nothing
in the box phones home except (a) the CLIP weight download on first run and
(b) the Anthropic API call from `/caption` when the user opts in.

## Prerequisites

- Python 3.10+
- pip

No GPU required. CLIP runs fine on CPU; Apple Silicon (MPS) is picked up
automatically by `sentence-transformers`.

## Setup

```bash
cd server

# Create a virtual environment (recommended)
python3 -m venv .venv
source .venv/bin/activate      # macOS / Linux
# .venv\Scripts\activate       # Windows

# Install dependencies
pip install -r requirements.txt
```

On first run, `sentence-transformers` downloads the CLIP ViT-B/32 weights
(~350 MB) into `~/.cache/huggingface/`. Subsequent starts are instant.

To enable AI captions, set the Anthropic API key in the same shell:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

Without the key, `/embed` still works and `/caption` returns `503` — the
client treats this as "captions unavailable" and the slideshow runs without
overlays.

## Running

```bash
# From server/, with the venv active and (optionally) the API key exported:
uvicorn main:app --port 8000 --reload
```

You should see:

```
INFO  Loading CLIP ViT-B/32 — downloading on first run (~350 MB)…
INFO  CLIP ready.
INFO  Uvicorn running on http://127.0.0.1:8000
```

Verify it works:

```bash
curl http://localhost:8000/health
# {"status":"ok","embed":"clip-ViT-B-32","caption_enabled":true}
```

## Using with the client

Run the server alongside the Vite dev server:

```bash
# Terminal 1 — local server
cd server && source .venv/bin/activate && ANTHROPIC_API_KEY=... uvicorn main:app --port 8000

# Terminal 2 — Vite dev server (debug mode)
cd client && npm run dev:debug
```

Semantic clustering is activated by passing `useSemanticClustering: true` to
`runPhase1`. AI captions are opt-in via the toggle on the upload page; the
preference is persisted in `localStorage` under `unkept.captionsEnabled`.

When the server is not running, the embedding stage logs a warning and sets
all embeddings to `null` — the cluster stage falls back to calendar-day
grouping. The caption flow simply yields no overlays.

## API reference

### `GET /health`

```json
{
  "status": "ok",
  "embed": "clip-ViT-B-32",
  "caption_enabled": true
}
```

### `POST /embed`

**Request:**
```json
{
  "images": [
    { "id": "photo_0", "data": "data:image/jpeg;base64,..." },
    { "id": "photo_1", "data": "data:image/jpeg;base64,..." }
  ]
}
```

Images should be JPEG data URLs. The client sends photos at 512px on the
longest edge — large enough for the server's bicubic preprocessing to have
good signal when it resizes to CLIP's 224×224 input.

**Response:**
```json
{
  "embeddings": [
    { "id": "photo_0", "vector": [0.032, -0.118, ...] },
    { "id": "photo_1", "vector": [-0.074, 0.201, ...] }
  ]
}
```

Each `vector` is a 512-element float array, L2-normalised. Cosine
similarity between two vectors equals their dot product.

### `POST /caption`

**Request:**
```json
{
  "chapter_id": "ch_3",
  "hero_image": "data:image/jpeg;base64,...",
  "day_index": 3,
  "date": "2026-05-14",
  "location_label": "Ubud, Bali",
  "photo_count": 12
}
```

**Response:** `text/event-stream` (SSE). Each event is one of:

```
event: delta
data: "<text chunk>"

event: done
data: ""

event: error
data: "<message>"
```

`data:` payloads are always JSON-encoded so newlines and quotes survive.
Streams end with exactly one `done` or `error` event.

**Model:** `claude-haiku-4-5-20251001`, `max_tokens=200`, `cache_control:
ephemeral` on the system block. The system prompt is currently the
placeholder `"Describe this image"` — iterate on it in `server/main.py`.

**Errors:**
- `503` — `ANTHROPIC_API_KEY` not set on the server
- `400` — `hero_image` is not a base64 data URL

## How the pipeline uses the server

```
EXIF → Dedup → [Embedding] → Cluster → Hero → Chapters → Thumbnail → Quality
                    ↑
           Only when useSemanticClustering=true
```

Captions are kicked off in `App.jsx` as soon as the Story Skeleton is
ready, in parallel across all chapters. The state lives in App and flows
down through `SlideshowPlayer` → `PhotoCardFrame`, where it renders as a
bottom overlay that streams text in as deltas arrive.

## Troubleshooting

**`Connection refused` on port 8000** — the server is not running. The
embedding stage logs a warning and falls back to calendar-day clustering;
the caption flow yields no overlays.

**`503` from `/caption`** — `ANTHROPIC_API_KEY` not set. Set it in the
shell that runs uvicorn, or restart with `export ANTHROPIC_API_KEY=...`
first.

**Slow first embed** — CLIP is loading into memory. Subsequent batches are
fast (~50–100 ms per batch of 16 on CPU, ~10–20 ms on MPS).

**`anthropic` / `sentence_transformers` import error** — run
`pip install -r requirements.txt` inside the activated venv.

**Port conflict** — change `--port 8000` in the uvicorn command, then
update `EMBED_SERVER` in `client/src/lib/pipeline/stages/embedding.js`
and `CAPTION_SERVER` in `client/src/lib/captions.js`.
