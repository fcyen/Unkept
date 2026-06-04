// Feature flags for the live MVP. Toggle these to flip whole surfaces on
// or off without ripping out the implementation — the slideshow renderer
// stays in the bundle and the /dev route keeps exercising it, but the
// production flow skips it while the design intent is still firming up.
export const FEATURES = {
  slideshow: false,
  // Beta usage telemetry. Off by default; flipped on for the beta deploy
  // only. When off, `track()` is a no-op and nothing is sent — the app
  // makes no network call. Anonymous, non-identifying counts only; see
  // client/src/lib/analytics.js for the privacy guardrails.
  betaTelemetry: true,
};

// Public URL of the Supabase Edge Function that ingests telemetry. This is
// the only telemetry-related string that ships in the browser bundle — it
// is a write-only gateway, not a database endpoint, and holds no secret.
// Set VITE_TELEMETRY_ENDPOINT at build time (Netlify env var); falls back to
// empty, which — together with betaTelemetry — keeps telemetry inert until
// both the flag and the endpoint are present.
export const TELEMETRY_ENDPOINT =
  import.meta.env.VITE_TELEMETRY_ENDPOINT || '';
