// Beta usage telemetry — anonymous, non-identifying counts only.
//
// Design (see issue #50):
// - Fires only when BOTH FEATURES.betaTelemetry is on AND an endpoint is
//   configured. Otherwise every call here is a no-op and no network request
//   is made — the disconnect-the-WiFi privacy demo still holds for photos.
// - The browser never talks to the database. Events POST to a Supabase Edge
//   Function (TELEMETRY_ENDPOINT) which validates, strips IP, buckets the
//   user agent, and inserts via a service-role key the client never sees.
// - session_id is a per-tab UUID generated in memory and NEVER persisted, so
//   there is no cross-session identifier and nothing to tie back to a person.
//
// Privacy guardrails — what this module must never send:
//   • no photo bytes, thumbnails, filenames, GPS coords, or EXIF
//   • no persistent user id (session_id is in-memory only)
//   • no IP / no raw user-agent (the Edge Function handles coarse bucketing)
// Keep event `properties` to plain scalar counts and timings.

import { FEATURES, TELEMETRY_ENDPOINT } from '../config.js';

const APP_VERSION = import.meta.env.VITE_APP_VERSION || 'dev';

// Per-tab session id. Lives only in this module's memory — a page reload
// starts a fresh session by design. Crypto UUID where available, with a
// cheap fallback for older engines.
const SESSION_ID = (() => {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
})();

function enabled() {
  return FEATURES.betaTelemetry && Boolean(TELEMETRY_ENDPOINT);
}

// One-time breadcrumb so it's obvious from the browser console why
// telemetry is or isn't firing in a given deploy — surfaces the most common
// misconfiguration (env var missing from the build) without needing to
// view-source the bundle.
if (typeof console !== 'undefined') {
  if (enabled()) {
    console.info('[telemetry] enabled →', TELEMETRY_ENDPOINT);
  } else {
    console.info(
      '[telemetry] inert — betaTelemetry:',
      FEATURES.betaTelemetry,
      'endpoint:',
      TELEMETRY_ENDPOINT ? 'set' : 'missing',
    );
  }
}

// Pending events are batched and flushed on a short timer, on reaching a
// size cap, and on page hide — so a closing tab still delivers what it has.
const BATCH_MAX = 20;
const FLUSH_DELAY_MS = 5000;
let queue = [];
let flushTimer = null;

function scheduleFlush() {
  if (flushTimer != null) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flush();
  }, FLUSH_DELAY_MS);
}

// Strip anything non-scalar from properties as a last line of defence — a
// caller should never pass objects/arrays (which could smuggle PII), so we
// drop them rather than serialise them.
function sanitizeProps(props) {
  if (!props || typeof props !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(props)) {
    const t = typeof v;
    if (t === 'number' || t === 'boolean' || t === 'string') out[k] = v;
  }
  return out;
}

/**
 * Record a telemetry event. No-op unless telemetry is enabled.
 * @param {string} name  event name, e.g. 'photos_uploaded'
 * @param {Object} [props] plain scalar counts/timings only
 */
export function track(name, props = {}) {
  if (!enabled()) return;
  queue.push({
    session_id: SESSION_ID,
    event_name: name,
    properties: sanitizeProps(props),
    client_ts: new Date().toISOString(),
    app_version: APP_VERSION,
  });
  if (queue.length >= BATCH_MAX) flush();
  else scheduleFlush();
}

/**
 * Send queued events now. Uses sendBeacon when available (survives page
 * unload); falls back to fetch with keepalive. Failures are swallowed —
 * telemetry must never disrupt the app or surface an error to the user.
 */
export function flush() {
  if (!enabled() || queue.length === 0) return;
  if (flushTimer != null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  const events = queue;
  queue = [];
  const payload = JSON.stringify({ events });

  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([payload], { type: 'application/json' });
      const ok = navigator.sendBeacon(TELEMETRY_ENDPOINT, blob);
      if (ok) return;
      // sendBeacon can refuse (e.g. payload too large / queue full); fall back.
    }
    fetch(TELEMETRY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* never let telemetry throw into the app */
  }
}

// Flush on the way out. visibilitychange→hidden is the reliable signal on
// mobile (pagehide/beforeunload are flaky there); guard for SSR/tests.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  window.addEventListener('pagehide', flush);
}
