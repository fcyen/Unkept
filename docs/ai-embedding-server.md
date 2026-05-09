# AI Embedding Server

Local Python server that runs CLIP ViT-B/32 and exposes a `/embed` endpoint
for the Unkept pipeline. The browser sends 224px photo thumbnails; the server
returns 512-dimensional L2-normalised embeddings used for semantic clustering.

## Why CLIP

CLIP (Contrastive Language–Image Pretraining, OpenAI 2021, MIT licence) is
trained on 400 million image–text pairs. It embeds images into a shared
vector space where visual similarity equals geometric proximity — beach photos
cluster together, city shots cluster together, regardless of when they were
taken. This is the property we exploit for chapter grouping.

The alternative (calendar-day clustering) groups photos by timestamp alone.
CLIP groups them by what they *look like*. The contrast between the two
approaches is visible in the `/pipeline` debug route.

## Prerequisites

- Python 3.10+
- pip

No GPU required. The server runs fine on CPU; Apple Silicon (MPS) is used
automatically by `sentence-transformers` when available.

## Setup

```bash
cd server/embed

# Create a virtual environment (recommended)
python3 -m venv .venv
source .venv/bin/activate      # macOS / Linux
# .venv\Scripts\activate       # Windows

# Install dependencies
pip install -r requirements.txt
```

On first run, `sentence-transformers` downloads the CLIP ViT-B/32 weights
(~350 MB) into its cache (`~/.cache/huggingface/`). Subsequent starts are
instant.

## Running

```bash
# From server/embed/, with the venv active:
uvicorn main:app --port 8000 --reload
```

You should see:

```
INFO  Loading CLIP ViT-B/32 — downloading on first run (~350 MB)…
INFO  Model ready.
INFO  Uvicorn running on http://127.0.0.1:8000
```

Verify it works:

```bash
curl http://localhost:8000/health
# {"status":"ok","model":"clip-ViT-B-32"}
```

## Using with the pipeline

Run the embedding server alongside the Vite dev server:

```bash
# Terminal 1 — embedding server
cd server/embed && source .venv/bin/activate && uvicorn main:app --port 8000

# Terminal 2 — Vite dev server (debug mode)
cd client && npm run dev:debug
```

In the pipeline, semantic clustering is activated by passing
`useSemanticClustering: true` to `runPhase1`. The debug route will expose
a toggle for this once the UI wiring is complete.

When the embedding server is not running, the embedding stage logs a warning
and sets all embeddings to `null`. The cluster stage falls back to
calendar-day grouping automatically — the pipeline never fails due to a
missing server.

## How the pipeline uses embeddings

```
EXIF → Dedup → [Embedding] → Cluster → Hero → Chapters → Thumbnail → Quality
                    ↑
           Only when useSemanticClustering=true
```

1. **Embedding stage** (`stages/embedding.js`): decodes each photo to 224×224,
   sends batches of 16 to `POST /embed`, stores `photo.embedding` (Float32Array,
   512 dims).

2. **Semantic cluster stage** (`stages/clusterSemantic.js`): runs k-means++ on
   the embedding vectors using cosine similarity. k defaults to
   `clamp(round(n/8), 2, 12)`. Photos are sorted chronologically within each
   cluster; clusters are sorted by their earliest timestamp.

## API reference

### `GET /health`

Returns `{"status": "ok", "model": "clip-ViT-B-32"}`.

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
good signal when it resizes to CLIP's 224×224 input. The server does not
resize; that is handled by `sentence-transformers`' preprocessing pipeline.

**Response:**
```json
{
  "embeddings": [
    { "id": "photo_0", "vector": [0.032, -0.118, ...] },
    { "id": "photo_1", "vector": [-0.074, 0.201, ...] }
  ]
}
```

Each `vector` is a 512-element float array, L2-normalised (unit length).
Cosine similarity between two vectors equals their dot product.

## Troubleshooting

**`Connection refused` on port 8000** — the embedding server is not running.
The pipeline will fall back to calendar-day clustering with a console warning.

**Slow first embed** — model is loading into memory. Subsequent batches are
fast (~50–100 ms per batch of 16 on CPU, ~10–20 ms on MPS).

**`sentence_transformers` import error** — run `pip install -r requirements.txt`
inside the activated venv.

**Port conflict** — change `--port 8000` in the uvicorn command and update
`EMBED_SERVER` in `client/src/lib/pipeline/stages/embedding.js` to match.
