# Telemetry backend (Supabase)

Anonymous beta usage telemetry for Unkept — see issue #50. Raw events land in
a locked-down Postgres table, written **only** by an Edge Function. The
browser never touches the database.

```
browser → track() (batched, flushed on page hide)
        → POST  https://<PROJECT_REF>.supabase.co/functions/v1/track
        → Edge Function (validate, strip IP, bucket UA, rate-limit)
        → service-role insert → public.events
```

The Supabase project ref is intentionally kept out of the repo. Substitute
your own `<PROJECT_REF>` below — `supabase link` (step 1) stores it locally in
the gitignored `supabase/.temp/`, so it never needs to be committed.

## Layout

```
supabase/
  migrations/0001_events.sql   events table + locked-down RLS + analysis views
  functions/track/index.ts     the only writer; service-role insert
```

## One-time setup

1. **Install + link the CLI**
   ```
   npm install -g supabase
   supabase login
   supabase link --project-ref <PROJECT_REF>
   ```

2. **Apply the migration** (creates `events`, RLS, and the views)
   ```
   supabase db push
   ```

3. **(Optional) Set the CORS origin secret**

   `SUPABASE_URL` and the `SUPABASE_SECRET_KEYS` JSON object are auto-injected
   into every Edge Function by the platform. The Function reads
   `SUPABASE_SECRET_KEYS.edge_function` from that JSON directly.

   The only optional secret locks CORS to one or more exact origins:
   ```
   supabase secrets set TELEMETRY_ALLOWED_ORIGIN=https://unkept.netlify.app
   ```
   For local testing plus production, use a comma-separated list:
   ```
   supabase secrets set TELEMETRY_ALLOWED_ORIGIN=http://localhost:5173,https://unkept.netlify.app
   ```
   Leave it unset to default to `*` (fine for early beta).

4. **Deploy the Function**
   ```
   supabase functions deploy track
   ```
   The Function is intentionally **public + anonymous** — JWT verification
   is turned off via `supabase/config.toml` (`[functions.track] verify_jwt
   = false`). If you skip the config file, the platform will reject every
   request with a 401 before our handler runs, which the browser surfaces
   as a misleading CORS error. The deploy command picks up the config
   automatically.

5. **Point the client at it** (Netlify build env, or client/.env.local) — set
   **both** env vars and trigger a fresh Netlify deploy. Vite inlines these at
   build time, so existing bundles won't pick them up until rebuilt.
   ```
   VITE_BETA_TELEMETRY=true
   VITE_TELEMETRY_ENDPOINT=https://<PROJECT_REF>.supabase.co/functions/v1/track
   ```
   Both must be present (and `VITE_BETA_TELEMETRY` must be the literal string
   `true`) or telemetry stays inert. To verify in a deployed bundle, view the
   page source and grep the JS for `supabase.co/functions/v1/track` — if it's
   missing, the env var didn't make it into the build.

## Events

Eight events, all anonymous scalar counts/timings (see `client/src/lib/analytics.js`):

| Event | Properties | Fired from |
|---|---|---|
| `photos_uploaded` | `count` | UploadPage — Start curating |
| `time_to_curation` | `ms` | UploadPage — Start curating → curation screen |
| `pipeline_stage_duration` | `{stage: ms}` per stage | usePipeline — after Phase 1 |
| `curation_duration` | `ms` | CurationScreen — mount → Finish |
| `toggle_count` | `presses`, `touched` | CurationScreen — Finish |
| `curation_funnel` | `uploaded`, `autoKept`, `userKept` | CurationScreen — Finish |
| `bail_out` | `from` (`back` \| `tab_close`) | CurationScreen — left before Finish |
| `error` | `source`, `name` \| `failed` | pipeline / finalize fail, compat-gate reject |

## Analysis

Views are saved queries — open the Supabase SQL editor and `select * from
v_<name>;`. `0001_events.sql` ships `v_photos_uploaded`; `0002_metric_views.sql`
adds one view per remaining metric: `v_time_to_curation`, `v_curation_duration`,
`v_toggle_count`, `v_curation_funnel`, `v_pipeline_stage_duration`, `v_bail_out`,
`v_errors`. Apply with `supabase db push`.
