const POSTHOG_CAPTURE_PATH = '/capture';
const TELEMETRY_VERSION = 1;

const BLOCKED_PROPERTY_KEYS = new Set([
  'chapter',
  'chapters',
  'coord',
  'coords',
  'date',
  'dateRange',
  'file',
  'fileName',
  'filename',
  'gps',
  'image',
  'images',
  'photo',
  'photoId',
  'photoIds',
  'photos',
  'skeleton',
  'thumbnail',
  'thumbnailUrl',
  'timestamp',
]);

export const TELEMETRY_EVENTS = Object.freeze({
  STORY_INTENT_SELECTED: 'story_intent_selected',
  STORY_STARTED: 'story_started',
  STORY_COMPLETED: 'story_completed',
  STORY_EXITED: 'story_exited',
  STORY_REPLAYED: 'story_replayed',
});

export function createStoryRunId() {
  const uuid = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : fallbackUuid();
  return `run_${uuid}`;
}

export function track(event, properties = {}) {
  const apiKey = import.meta.env.VITE_POSTHOG_KEY;
  if (!apiKey) return false;

  const host = normaliseHost(import.meta.env.VITE_POSTHOG_HOST);
  const body = JSON.stringify({
    api_key: apiKey,
    event,
    distinct_id: properties.storyRunId || 'anonymous',
    properties: sanitizeProperties({
      ...properties,
      app: 'unkept',
      telemetryVersion: TELEMETRY_VERSION,
    }),
  });

  const url = `${host}${POSTHOG_CAPTURE_PATH}`;

  if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    const blob = new Blob([body], { type: 'application/json' });
    if (navigator.sendBeacon(url, blob)) return true;
  }

  if (typeof fetch === 'function') {
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
    return true;
  }

  return false;
}

export function sanitizeProperties(properties) {
  const sanitized = {};

  for (const [key, value] of Object.entries(properties || {})) {
    if (BLOCKED_PROPERTY_KEYS.has(key)) continue;
    if (value == null) continue;
    if (!isAllowedValue(value)) continue;
    sanitized[key] = value;
  }

  return sanitized;
}

function normaliseHost(host) {
  return (host || 'https://us.i.posthog.com').replace(/\/+$/, '');
}

function isAllowedValue(value) {
  const valueType = typeof value;
  return valueType === 'string' ||
    valueType === 'number' ||
    valueType === 'boolean';
}

function fallbackUuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}
