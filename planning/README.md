# Planning — Two-Model Aesthetic Scoring

This folder is a reading guide for the aesthetic-scoring comparison work in
this PR. Rather than copying source, it links to the actual files so the
links always reflect the current state of the branch.

The feature adds a vision-model **keeper-scoring** stage to the selection
pipeline and turns the `/pipeline` debug view into an A/B comparison surface:
each photo is scored by two vision models side by side, you can vote for the
model you trust, and scores are cached so re-runs don't re-bill the LLM.

## Selection pipeline (runs in the browser)

- [`client/src/lib/pipeline/stages/aestheticScore.js`](../client/src/lib/pipeline/stages/aestheticScore.js)
  — the vision scoring stage. Cheap Laplacian pre-filter gates the expensive
  model; posts ≤512px thumbnails to the proxy; degrades gracefully when the
  proxy is down. Normalises both the single- and multi-model response shapes.
- [`client/src/lib/pipeline/stages/aestheticScore.test.js`](../client/src/lib/pipeline/stages/aestheticScore.test.js)
  — unit tests for the stage (health-probe fallback, score attachment,
  pre-filter cap, multi-model normalisation).
- [`client/src/lib/pipeline/stages/heroSelect.js`](../client/src/lib/pipeline/stages/heroSelect.js)
  — consumes the **primary** model's score to pick each cluster's hero, with a
  classical-CV fallback.
- [`client/src/lib/pipeline/orchestrator.js`](../client/src/lib/pipeline/orchestrator.js)
  — wires the aesthetic stage into the pipeline (between cluster and hero).
- [`client/src/lib/pipeline/strategies.js`](../client/src/lib/pipeline/strategies.js)
  — strategy registry for swappable stage implementations.

## Server proxy (opt-in, holds the API keys)

- [`server/routes/aesthetic.js`](../server/routes/aesthetic.js)
  — provider-agnostic OpenAI-compatible proxy. Scores each photo against every
  configured provider in parallel, content-addresses the results in a
  persisted cache, and exposes `health` / `cache` endpoints.
- [`server/.env.example`](../server/.env.example)
  — provider configuration template (primary + optional second model).

## Debug UI — the `/pipeline` route

- [`client/src/dev/PipelineDebugRoute.jsx`](../client/src/dev/PipelineDebugRoute.jsx)
  — per-stage inspector. Houses the side-by-side `ModelComparison`, per-photo
  model voting, the `VoteTally` scoreboard, and the `CacheControl` button.
- [`client/src/dev/usePipelineDebug.js`](../client/src/dev/usePipelineDebug.js)
  — runs the pipeline and extracts a per-stage snapshot (including per-photo
  model scores and the distinct model labels).

## Config & docs

- [`client/src/config.js`](../client/src/config.js)
  — `FEATURES.aestheticScoring` flag (and the optional second-provider note).
- [`docs/ai-aesthetic-proxy.md`](../docs/ai-aesthetic-proxy.md)
  — full proxy setup, caching behaviour, and API reference.
- [`CLAUDE.md`](../CLAUDE.md)
  — project guide; see the "Key decisions" and "Learning intent" sections for
  why the scoring is a swappable, visible, classical-vs-ML contrast.

## How to run it

See the PR description for step-by-step instructions on running the client
and server locally in debug mode and supplying the API keys.
