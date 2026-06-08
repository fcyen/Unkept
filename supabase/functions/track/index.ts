// Telemetry ingestion gateway (issue #50).
//
// The ONLY writer to the `events` table. The browser POSTs anonymous,
// non-identifying event batches here; this function validates them, drops
// anything PII-shaped, buckets the user agent coarsely, ignores the client
// IP, and inserts with the edge-function DB key (which never reaches the
// client).
//
// Deploy:  supabase functions deploy track
// Secrets: SUPABASE_URL and SUPABASE_SECRET_KEYS JSON are auto-injected.
//          TELEMETRY_ALLOWED_ORIGIN is optional and restricts CORS to your site.

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ALLOWED_ORIGINS = (Deno.env.get("TELEMETRY_ALLOWED_ORIGIN") || "*")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

// Netlify deploy-preview and branch-deploy subdomains of the production site.
// These rotate per PR/branch (deploy-preview-58--unkept.netlify.app, a feature
// branch's <branch>--unkept.netlify.app, …) so they can't be enumerated in the
// allowlist secret — match them by pattern instead. Prod stays explicitly
// listed via TELEMETRY_ALLOWED_ORIGIN; this only adds preview origins of the
// same site, which is safe given the endpoint is anonymous + validated + RLS.
const NETLIFY_PREVIEW = /^https:\/\/[a-z0-9-]+--unkept\.netlify\.app$/;

function isAllowedOrigin(origin: string): boolean {
  return ALLOWED_ORIGINS.includes(origin) || NETLIFY_PREVIEW.test(origin);
}

// Caps — reject obviously abusive payloads outright.
const MAX_EVENTS_PER_BATCH = 50;
const MAX_PROP_KEYS = 20;
const MAX_STRING_LEN = 200;
const MAX_NAME_LEN = 60;

// Best-effort in-memory rate limit per session id. Edge Function instances
// are ephemeral and may scale out, so this is a speed bump, not a guarantee —
// the real backstop is the insert-only, read-denied table.
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_REQ = 60;
const hits = new Map<string, number[]>();

function getEdgeFunctionKey(): string {
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (!raw) {
    throw new Error("missing auto-injected SUPABASE_SECRET_KEYS JSON secret");
  }

  try {
    const secrets = JSON.parse(raw) as unknown;
    const edgeFunctionKey =
      secrets && typeof secrets === "object"
        ? (secrets as { edge_function?: unknown }).edge_function
        : undefined;
    if (typeof edgeFunctionKey === "string" && edgeFunctionKey.length > 0) {
      return edgeFunctionKey;
    }
  } catch {
    throw new Error("SUPABASE_SECRET_KEYS must be JSON with an edge_function key");
  }

  throw new Error("missing edge_function key in auto-injected SUPABASE_SECRET_KEYS JSON");
}

function rateLimited(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) || []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);
  return recent.length > RATE_MAX_REQ;
}

// Map a raw UA string to a coarse bucket. The raw string is never stored.
function uaBucket(ua: string): string {
  const s = ua.toLowerCase();
  const mobile = /mobile|iphone|ipad|android/.test(s);
  let engine = "other";
  if (/edg\//.test(s)) engine = "edge";
  else if (/chrome|crios/.test(s)) engine = "chrome";
  else if (/firefox|fxios/.test(s)) engine = "firefox";
  else if (/safari/.test(s)) engine = "safari";
  return `${engine}-${mobile ? "mobile" : "desktop"}`;
}

// Keep only scalar properties — objects/arrays could smuggle PII, so drop
// them. Also bound key count and string length.
function sanitizeProps(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object") return {};
  const out: Record<string, unknown> = {};
  let n = 0;
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (n >= MAX_PROP_KEYS) break;
    const t = typeof v;
    if (t === "number" || t === "boolean") {
      out[k] = v;
      n++;
    } else if (t === "string") {
      out[k] = (v as string).slice(0, MAX_STRING_LEN);
      n++;
    }
  }
  return out;
}

function corsHeaders(req: Request): HeadersInit {
  const requestOrigin = req.headers.get("origin") || "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };

  if (ALLOWED_ORIGINS.includes("*") || !requestOrigin) {
    // Wildcard config, or no Origin header (curl / same-origin) → permissive.
    headers["Access-Control-Allow-Origin"] = "*";
  } else if (isAllowedOrigin(requestOrigin)) {
    // Echo the exact caller's origin (required when not using "*").
    headers["Access-Control-Allow-Origin"] = requestOrigin;
  }
  // Otherwise omit Access-Control-Allow-Origin entirely so the browser cleanly
  // blocks a genuinely-disallowed origin. (The previous fallback echoed
  // ALLOWED_ORIGINS[0] — a concrete non-matching origin — which forced a
  // confusing CORS failure instead of an honest deny.)

  return headers;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405, headers: corsHeaders(req) });
  }

  let body: { events?: unknown };
  try {
    body = await req.json();
  } catch {
    return new Response("bad json", { status: 400, headers: corsHeaders(req) });
  }

  const events = Array.isArray(body.events) ? body.events : [];
  if (events.length === 0 || events.length > MAX_EVENTS_PER_BATCH) {
    return new Response("bad batch", { status: 400, headers: corsHeaders(req) });
  }

  const ua = req.headers.get("user-agent") || "";
  const bucket = uaBucket(ua);

  // Rate-limit on session id from the first event (falls back to UA bucket).
  // We intentionally do NOT use the client IP for anything — not for limiting,
  // not for storage.
  const first = events[0] as Record<string, unknown>;
  const rlKey = typeof first?.session_id === "string" ? first.session_id : bucket;
  if (rateLimited(rlKey)) {
    return new Response("rate limited", { status: 429, headers: corsHeaders(req) });
  }

  const rows = [];
  for (const e of events as Array<Record<string, unknown>>) {
    if (typeof e?.session_id !== "string" || typeof e?.event_name !== "string") continue;
    if (e.event_name.length > MAX_NAME_LEN) continue;
    rows.push({
      session_id: e.session_id.slice(0, 80),
      event_name: e.event_name,
      properties: sanitizeProps(e.properties),
      client_ts: typeof e.client_ts === "string" ? e.client_ts : null,
      app_version: typeof e.app_version === "string" ? e.app_version.slice(0, 40) : null,
      ua_bucket: bucket,
    });
  }
  if (rows.length === 0) {
    return new Response("no valid events", { status: 400, headers: corsHeaders(req) });
  }

  const supabase = createClient(SUPABASE_URL, getEdgeFunctionKey(), {
    auth: { persistSession: false },
  });
  const { error } = await supabase.from("events").insert(rows);
  if (error) {
    // Don't leak DB internals to the client; log server-side for debugging.
    console.error("insert failed:", error.message);
    return new Response("insert failed", { status: 500, headers: corsHeaders(req) });
  }

  return new Response(null, { status: 204, headers: corsHeaders(req) });
});
