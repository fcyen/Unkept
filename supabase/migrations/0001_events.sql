-- Beta usage telemetry — raw event store (issue #50).
--
-- One row per event. We aggregate at query time (see views below) rather
-- than pre-summarising, so new questions don't require a schema change.
--
-- Security model: this table is written ONLY by the `track` Edge Function
-- using the service_role key (which bypasses RLS). RLS is enabled with NO
-- policies, so the anon key — the only key that could ever reach a browser —
-- can neither read nor write. There is no client-side path to this table.

create extension if not exists "pgcrypto";

create table if not exists public.events (
  id          uuid        primary key default gen_random_uuid(),
  -- Per-tab UUID generated in memory by the client, never persisted there.
  -- Not tied to any person; lets us group events within a single session.
  session_id  text        not null,
  event_name  text        not null,
  -- Plain scalar counts/timings only. No PII — enforced client-side and
  -- re-checked in the Edge Function before insert.
  properties  jsonb       not null default '{}'::jsonb,
  -- Browser-supplied timestamp (when the event happened).
  client_ts   timestamptz,
  -- Server insert time (authoritative ordering; defends against clock skew).
  server_ts   timestamptz not null default now(),
  app_version text,
  -- Coarse user-agent bucket set server-side ("chrome-desktop", etc.).
  -- The raw UA string is never stored.
  ua_bucket   text
);

create index if not exists events_event_name_server_ts_idx
  on public.events (event_name, server_ts);
create index if not exists events_session_id_idx
  on public.events (session_id);

-- Lock it down: RLS on, no policies → anon/public can do nothing. Only the
-- service_role (held solely by the Edge Function) can write.
alter table public.events enable row level security;

-- ---------------------------------------------------------------------------
-- Analysis views. Saved queries you re-run/refresh — no ad-hoc SQL needed for
-- the day-to-day metrics. More land in PR 2 alongside the remaining events.
-- ---------------------------------------------------------------------------

-- Photos uploaded per session, plus a daily roll-up of volume.
create or replace view public.v_photos_uploaded as
select
  date_trunc('day', server_ts)            as day,
  count(*)                                 as upload_events,
  sum((properties->>'count')::int)         as total_photos,
  round(avg((properties->>'count')::numeric), 1) as avg_photos_per_upload
from public.events
where event_name = 'photos_uploaded'
group by 1
order by 1 desc;
