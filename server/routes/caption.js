/**
 * Caption generation proxy — PR 3A.
 *
 * The browser never holds the Anthropic API key. The client posts the
 * hero thumbnail (already 200–400px, no original bytes) plus chapter
 * metadata; we forward to Anthropic Messages API with streaming on and
 * pipe the text deltas back over Server-Sent Events.
 *
 * Prompt caching: the system prompt is identical for every chapter in a
 * story, so we mark it `cache_control: ephemeral`. With ~6 chapters in
 * a typical trip that's a ~5x reduction in system-prompt tokens billed.
 */

import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';

const router = Router();

const SYSTEM_PROMPT = [
  'You write captions for chapters of a personal photo slideshow in the style of Spotify Wrapped or Apple Memories.',
  '',
  'Rules:',
  '- 1–2 sentences, 12–25 words total. Never longer.',
  '- Second person ("you"); present tense.',
  '- Anchor in the place and time when given. If the photo gives a clearer cue (food, faces, weather, terrain) prefer that.',
  '- No emoji, no lists, no quotes, no hashtags.',
  '- Avoid the words: magical, unforgettable, memories, journey, adventure, captured, breathtaking.',
  '- Return only the caption text — no preamble, no labels.',
].join('\n');

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';

router.post('/', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res
      .status(503)
      .json({ error: 'ANTHROPIC_API_KEY is not configured on the server.' });
  }

  const { chapter, trip, thumbnail } = req.body || {};
  if (!chapter || !trip || typeof thumbnail !== 'string') {
    return res
      .status(400)
      .json({ error: 'Expected { chapter, trip, thumbnail } in body.' });
  }

  const parsed = parseDataUrl(thumbnail);
  if (!parsed) {
    return res
      .status(400)
      .json({ error: 'thumbnail must be a base64 image data URL.' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const send = (event, payload) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  const userPrompt = buildUserPrompt({ chapter, trip });
  const client = new Anthropic({ apiKey });

  // If the client hangs up before we finish, abort the SDK call so we
  // stop billing for tokens nobody will read.
  const abort = new AbortController();
  req.on('close', () => abort.abort());

  try {
    const stream = client.messages.stream(
      {
        model: MODEL,
        max_tokens: 120,
        system: [
          {
            type: 'text',
            text: SYSTEM_PROMPT,
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: parsed.mediaType,
                  data: parsed.data,
                },
              },
              { type: 'text', text: userPrompt },
            ],
          },
        ],
      },
      { signal: abort.signal },
    );

    stream.on('text', (delta) => {
      if (!res.writableEnded) send('delta', { text: delta });
    });

    const finalMessage = await stream.finalMessage();
    if (!res.writableEnded) {
      send('done', {
        usage: finalMessage.usage ?? null,
        stopReason: finalMessage.stop_reason ?? null,
      });
      res.end();
    }
  } catch (err) {
    if (abort.signal.aborted) {
      // Client gave up — nothing to report.
      if (!res.writableEnded) res.end();
      return;
    }
    if (!res.writableEnded) {
      send('error', { message: err?.message || 'caption stream failed' });
      res.end();
    }
  }
});

function buildUserPrompt({ chapter, trip }) {
  const lines = [
    `Trip: ${trip.name}`,
    `Trip dates: ${trip.dateRange?.start ?? '?'} → ${trip.dateRange?.end ?? '?'}`,
    `Chapter title: ${chapter.title}`,
    `Day: ${chapter.dayIndex ?? '?'}`,
    chapter.date ? `Date: ${chapter.date}` : null,
    chapter.locationLabel ? `Location: ${chapter.locationLabel}` : null,
    chapter.country ? `Country: ${chapter.country}` : null,
    '',
    'Write the caption for this chapter using the rules in the system prompt.',
  ];
  return lines.filter(Boolean).join('\n');
}

function parseDataUrl(url) {
  const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(url);
  if (!m) return null;
  return { mediaType: m[1], data: m[2] };
}

export default router;
