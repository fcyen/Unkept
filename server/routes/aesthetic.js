/**
 * Vision aesthetic/keeper scoring proxy.
 *
 * POST /api/aesthetic  { photos: [{ id, data }, ...] }
 *   → { scores: [{ id, score, keep, reason } | null, ...] }
 *
 * Provider-agnostic OpenAI-compatible client. Configured via env:
 *   LLM_BASE_URL  e.g. https://api.moonshot.ai/v1   (Kimi)
 *                 e.g. https://api.openai.com/v1    (GPT-4o-mini)
 *   LLM_API_KEY   provider API key
 *   LLM_MODEL     e.g. moonshot-v1-8k-vision-preview, gpt-4o-mini
 *
 * Privacy: thumbnails only (data URL, ≤512px), never the original file.
 * Per-photo errors return null in their slot — the batch never 500s.
 *
 * The `openai` package is imported lazily so the server still boots if
 * it hasn't been installed yet.
 */
import { Router } from 'express';

const router = Router();

const PROMPT = `Score a single photo for keep-worthiness in a personal year-in-review slideshow.
Consider: subject clarity, expressions (eyes open, faces visible), composition, lighting.
Penalize: motion blur, closed eyes, awkward crops, busy backgrounds.

Respond with ONLY strict JSON, no prose or fences:
{"score": <0..1>, "keep": <true|false>, "reason": <string, <=12 words>}`;

let client;   // undefined = not initialised, null = unavailable, object = ready

async function getClient() {
  if (client !== undefined) return client;
  const baseURL = process.env.LLM_BASE_URL;
  const apiKey = process.env.LLM_API_KEY;
  if (!baseURL || !apiKey) {
    console.warn('[aesthetic] LLM_BASE_URL / LLM_API_KEY not set — proxy disabled.');
    client = null;
    return null;
  }
  try {
    const { default: OpenAI } = await import('openai');
    client = new OpenAI({ baseURL, apiKey });
    return client;
  } catch {
    console.warn('[aesthetic] `openai` package not installed — run `npm install` in server/.');
    client = null;
    return null;
  }
}

function model() {
  return process.env.LLM_MODEL || '';
}

function parseScore(content) {
  if (!content) return null;
  // Some models still wrap JSON in ```json fences despite the prompt.
  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  const score = typeof parsed.score === 'number' ? Math.max(0, Math.min(1, parsed.score)) : null;
  if (score == null) return null;
  const keep = typeof parsed.keep === 'boolean' ? parsed.keep : null;
  const reason = typeof parsed.reason === 'string' ? parsed.reason.slice(0, 80) : '';
  return { score, keep, reason };
}

async function scoreOne(c, item) {
  try {
    const response = await c.chat.completions.create({
      model: model(),
      max_tokens: 80,
      temperature: 0,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: PROMPT },
            { type: 'image_url', image_url: { url: item.data } },
          ],
        },
      ],
    });
    const parsed = parseScore(response.choices?.[0]?.message?.content);
    if (!parsed) return null;
    return { id: item.id, ...parsed };
  } catch (err) {
    console.warn('[aesthetic] score failed for', item.id, '-', err.message);
    return null;
  }
}

router.get('/health', async (_req, res) => {
  const c = await getClient();
  if (!c) return res.status(503).json({ status: 'unconfigured', model: null });
  res.json({ status: 'ok', model: model() });
});

router.post('/', async (req, res) => {
  const c = await getClient();
  if (!c) {
    return res.status(503).json({ error: 'aesthetic proxy unconfigured' });
  }
  const { photos } = req.body ?? {};
  if (!Array.isArray(photos)) {
    return res.status(400).json({ error: 'expected { photos: [{ id, data }, ...] }' });
  }
  const scores = await Promise.all(photos.map((item) => scoreOne(c, item)));
  res.json({ scores });
});

export default router;
