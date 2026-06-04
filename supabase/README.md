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

   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are **auto-injected** into
   every Edge Function by the platform — do NOT set them yourself (the CLI
   rejects the reserved `SUPABASE_` prefix). The Function reads them directly.

   The only optional secret locks CORS to the production origin:
   ```
   supabase secrets set TELEMETRY_ALLOWED_ORIGIN=https://unkept.netlify.app
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

## Security model

- `public.events` has RLS enabled with **no policies** → the `anon` key (the
  only key that could reach a browser) can neither read nor write.
- The `service_role` key bypasses RLS and is **auto-injected** into the Edge
  Function's server-side environment by the platform. It stays on the server
  and is never bundled into the client.
- The Function ignores the client IP entirely (not stored, not used for rate
  limiting) and stores only a coarse user-agent bucket, never the raw string.

## Analysis

Views in the migration are saved queries — open the Supabase SQL editor and
run e.g. `select * from v_photos_uploaded;`. More views land in PR 2 with the
remaining metrics (time-to-curation, curation duration, toggle counts) and the
extras (pipeline stage durations, curation funnel, bail-outs, errors).
