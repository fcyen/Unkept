/**
 * Captions client — Phase 3 / PR3A.
 *
 * Talks to the local Unkept server's `/caption` endpoint, which proxies to
 * Claude. Each chapter's hero thumbnail is sent as a data URL alongside a
 * small metadata block; the server streams text deltas back as Server-Sent
 * Events.
 *
 * Privacy: only the chapter's hero *thumbnail* leaves the device, and only
 * once the user has toggled captions on. Full-resolution photos never
 * cross the network.
 *
 * Streaming contract:
 *   event: delta   data: "<text chunk>"      (zero or more)
 *   event: done    data: ""                  (success terminator)
 *   event: error   data: "<message>"         (error terminator)
 * All `data:` payloads are JSON-encoded so they survive newlines.
 */

const CAPTION_SERVER = 'http://localhost:8000';

// ---------------------------------------------------------------------------
// Low-level: stream one chapter caption
// ---------------------------------------------------------------------------

/**
 * Fire a single caption request and stream deltas to the supplied callbacks.
 *
 * @param {object} req
 * @param {string} req.chapter_id
 * @param {string} req.hero_image           data URL (JPEG/PNG base64)
 * @param {number|null} req.day_index
 * @param {string|null} req.date            ISO date "YYYY-MM-DD"
 * @param {string|null} req.location_label  human-readable place
 * @param {number|null} req.photo_count
 * @param {object} handlers
 * @param {(text: string) => void} [handlers.onDelta]
 * @param {() => void} [handlers.onDone]
 * @param {(err: Error) => void} [handlers.onError]
 * @param {AbortSignal} [handlers.signal]
 */
export async function streamCaption(req, { onDelta, onDone, onError, signal } = {}) {
  let res;
  try {
    res = await fetch(`${CAPTION_SERVER}/caption`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') return;
    onError?.(err);
    return;
  }

  if (!res.ok) {
    let detail = res.statusText;
    try { detail = (await res.json()).detail || detail; } catch { /* not JSON */ }
    onError?.(new Error(`Caption server ${res.status}: ${detail}`));
    return;
  }

  try {
    for await (const event of parseSSE(res.body)) {
      if (event.type === 'delta') onDelta?.(event.data);
      else if (event.type === 'done') { onDone?.(); return; }
      else if (event.type === 'error') { onError?.(new Error(event.data || 'Caption error')); return; }
    }
    // Stream ended without a done event — treat as success.
    onDone?.();
  } catch (err) {
    if (err.name === 'AbortError') return;
    onError?.(err);
  }
}

// ---------------------------------------------------------------------------
// Story-level orchestrator
// ---------------------------------------------------------------------------

/**
 * Fire one caption request per chapter in parallel. Returns a Promise that
 * resolves when all chapters have either completed or errored.
 *
 * `onUpdate` is called whenever any caption's text or status changes. The
 * shape is `{ [chapterId]: { text, status, error } }` where status is one
 * of 'streaming' | 'done' | 'error'.
 *
 * @param {object} story        - output of buildStory / applyGeocoding
 * @param {object} opts
 * @param {(state) => void} opts.onUpdate
 * @param {AbortSignal} [opts.signal]
 */
export function startStoryCaptions(story, { onUpdate, signal } = {}) {
  const state = {};

  const emit = () => {
    // Hand the caller a shallow copy so React state updates trigger renders.
    const snapshot = {};
    for (const [id, entry] of Object.entries(state)) snapshot[id] = { ...entry };
    onUpdate?.(snapshot);
  };

  const tasks = story.chapters.map(async (chapter, i) => {
    const skelChapter = story.skeleton.chapters[i];
    const hero = story.skeleton.photos[chapter.heroPhotoId];
    if (!hero?.thumbnailUrl) {
      state[chapter.id] = { text: '', status: 'error', error: 'no hero thumbnail' };
      emit();
      return;
    }

    state[chapter.id] = { text: '', status: 'streaming', error: null };
    emit();

    await streamCaption(
      {
        chapter_id: chapter.id,
        hero_image: hero.thumbnailUrl,
        day_index: chapter.dayIndex,
        date: chapter.date,
        location_label: chapter.location?.label ?? null,
        photo_count: skelChapter.photoIds.length,
      },
      {
        onDelta: (text) => {
          state[chapter.id].text += text;
          emit();
        },
        onDone: () => {
          state[chapter.id].status = 'done';
          emit();
        },
        onError: (err) => {
          state[chapter.id].status = 'error';
          state[chapter.id].error = err.message;
          emit();
        },
        signal,
      },
    );
  });

  return Promise.all(tasks);
}

// ---------------------------------------------------------------------------
// SSE parser — exported for tests
// ---------------------------------------------------------------------------

/**
 * Async generator that yields `{ type, data }` events parsed from a
 * `text/event-stream` ReadableStream. `data` is JSON-decoded when possible;
 * otherwise the raw string is returned.
 */
export async function* parseSSE(stream) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let idx;
      while ((idx = buffer.indexOf('\n\n')) >= 0) {
        const raw = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        yield parseEvent(raw);
      }
    }
    // Flush a trailing event that wasn't followed by a blank line.
    buffer += decoder.decode();
    if (buffer.trim()) yield parseEvent(buffer);
  } finally {
    reader.releaseLock();
  }
}

function parseEvent(raw) {
  let type = 'message';
  let dataLines = [];
  for (const line of raw.split('\n')) {
    if (line.startsWith('event:')) type = line.slice(6).trim();
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''));
  }
  const joined = dataLines.join('\n');
  let data = joined;
  try { data = JSON.parse(joined); } catch { /* keep raw string */ }
  return { type, data };
}
