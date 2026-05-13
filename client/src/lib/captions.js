/**
 * Caption client — PR 3A.
 *
 * Calls the server proxy at `/api/caption` for each chapter and yields
 * text deltas as they stream in. The browser never holds the Anthropic
 * API key — the server proxy does that.
 *
 * Server-Sent Events were chosen over the Vercel AI SDK's data-stream
 * protocol because the rest of the codebase has no SDK-specific React
 * hooks and the protocol here is tiny (delta / done / error). If we
 * later switch to `useCompletion`, only this file and the runner change.
 */

const DEFAULT_SERVER_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SERVER_URL) ||
  'http://localhost:3001';

/**
 * Stream a single chapter caption. Yields text chunks; resolves when
 * the server signals `done`. Throws on protocol or transport errors.
 *
 * @param {object} payload
 * @param {object} payload.chapter   - { dayIndex, title, date, locationLabel, country }
 * @param {object} payload.trip      - { name, dateRange }
 * @param {string} payload.thumbnail - base64 image data URL
 * @param {object} [opts]
 * @param {string} [opts.serverUrl]  - override base URL
 * @param {AbortSignal} [opts.signal]
 */
export async function* streamChapterCaption(payload, opts = {}) {
  const baseUrl = opts.serverUrl || DEFAULT_SERVER_URL;
  const res = await fetch(`${baseUrl}/api/caption`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: opts.signal,
  });

  if (!res.ok) {
    let body = '';
    try { body = await res.text(); } catch { /* ignore */ }
    const message = parseErrorBody(body) || `${res.status} ${res.statusText}`;
    const err = new Error(`caption proxy: ${message}`);
    err.status = res.status;
    throw err;
  }
  if (!res.body) {
    throw new Error('caption proxy returned no body');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE events are separated by blank lines. We consume one event
      // at a time so a delta is delivered the moment it lands.
      let sep;
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const raw = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const ev = parseSseFrame(raw);
        if (ev.event === 'delta' && typeof ev.data?.text === 'string') {
          yield ev.data.text;
        } else if (ev.event === 'error') {
          throw new Error(ev.data?.message || 'caption stream error');
        } else if (ev.event === 'done') {
          return ev.data ?? null;
        }
      }
    }
  } finally {
    try { reader.releaseLock(); } catch { /* already released */ }
  }
  return null;
}

/**
 * Generate captions for every chapter in a Story in series. Calls
 * `onDelta(chapterId, text)` for each streamed chunk and resolves when
 * every chapter is done (or aborted).
 *
 * Serial-not-parallel is intentional: it keeps the system-prompt cache
 * hot across chapters (each call hits the same cached prefix) and keeps
 * the Vite dev server's SSE proxy from juggling six open streams.
 */
export async function generateStoryCaptions(story, { onDelta, signal, serverUrl } = {}) {
  const trip = {
    name: story.tripName,
    dateRange: story.dateRange,
  };

  for (const chapter of story.chapters) {
    if (signal?.aborted) return;
    const hero = story.skeleton.photos[chapter.heroPhotoId];
    if (!hero || !hero.thumbnailUrl) continue;

    const payload = {
      trip,
      chapter: {
        dayIndex: chapter.dayIndex,
        title: chapter.title,
        date: chapter.date,
        locationLabel: chapter.location?.label || null,
        country: chapter.location?.country || null,
      },
      thumbnail: hero.thumbnailHeroUrl || hero.thumbnailUrl,
    };

    try {
      for await (const delta of streamChapterCaption(payload, { signal, serverUrl })) {
        onDelta?.(chapter.id, delta);
      }
    } catch (err) {
      if (signal?.aborted) return;
      // Surface and continue — one failed caption shouldn't kill the rest.
      onDelta?.(chapter.id, '', { error: err });
    }
  }
}

function parseSseFrame(raw) {
  let event = 'message';
  let dataLines = [];
  for (const line of raw.split('\n')) {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart());
    }
  }
  const dataStr = dataLines.join('\n');
  let data = null;
  if (dataStr) {
    try { data = JSON.parse(dataStr); } catch { data = { raw: dataStr }; }
  }
  return { event, data };
}

function parseErrorBody(text) {
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed.error || parsed.message || null;
  } catch {
    return text.slice(0, 200);
  }
}
