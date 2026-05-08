"""
CLIP Embedding Server
=====================
Exposes a single POST /embed endpoint that accepts batches of base64-encoded
images and returns CLIP ViT-B/32 embeddings (512-dimensional, L2-normalised).

The pipeline's embeddingStage calls this server with 224px JPEG thumbnails
of each photo. The returned vectors are used by clusterSemantic.js to group
photos by visual content rather than calendar day.

Run:
    uvicorn main:app --port 8000 --reload
"""

import base64
import io
import logging
import time

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)

app = FastAPI(title="CLIP Embedding Server")

# Allow requests from the Vite dev server (any localhost port).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

log.info("Loading CLIP ViT-B/32 — downloading on first run (~350 MB)…")
_model = SentenceTransformer("clip-ViT-B-32")
log.info("Model ready.")


class ImageItem(BaseModel):
    id: str
    data: str  # data:image/jpeg;base64,<...>


class EmbedRequest(BaseModel):
    images: list[ImageItem]


class EmbedResponse(BaseModel):
    embeddings: list[dict]  # [{id, vector: [float × 512]}]


def decode_image(data_url: str) -> Image.Image:
    """Decode a data URL to a PIL Image in RGB mode."""
    _, b64 = data_url.split(",", 1)
    img_bytes = base64.b64decode(b64)
    return Image.open(io.BytesIO(img_bytes)).convert("RGB")


@app.get("/health")
def health():
    return {"status": "ok", "model": "clip-ViT-B-32"}


@app.post("/embed", response_model=EmbedResponse)
def embed(req: EmbedRequest):
    if not req.images:
        return EmbedResponse(embeddings=[])

    t0 = time.perf_counter()

    try:
        pil_images = [decode_image(item.data) for item in req.images]
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Image decode failed: {exc}")

    # encode() returns a numpy array of shape (n, 512), already L2-normalised
    # when normalize_embeddings=True.
    vectors = _model.encode(
        pil_images,
        batch_size=32,
        normalize_embeddings=True,
        show_progress_bar=False,
        convert_to_numpy=True,
    )

    elapsed = (time.perf_counter() - t0) * 1000
    log.info("Embedded %d images in %.0f ms", len(req.images), elapsed)

    return EmbedResponse(
        embeddings=[
            {"id": item.id, "vector": vectors[i].tolist()}
            for i, item in enumerate(req.images)
        ]
    )
