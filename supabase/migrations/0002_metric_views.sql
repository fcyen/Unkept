-- Beta telemetry — analysis views for the PR-2 metrics (issue #50).
--
-- Saved queries over the raw `events` table (see 0001_events.sql). Open the
-- Supabase SQL editor and `select * from v_<name>;` — no ad-hoc SQL for the
-- day-to-day questions. All timings are milliseconds, as sent by the client.
--
-- These are read-only views over a table only the Edge Function can write, so
-- they inherit its lockdown — no extra grants here.

-- ---------------------------------------------------------------------------
-- time_to_curation — "Start curating" → curation screen (pipeline + survey +
-- finalize + geocoding). The span that actually feels slow to the user.
-- ---------------------------------------------------------------------------
create or replace view public.v_time_to_curation as
select
  date_trunc('day', server_ts)                                            as day,
  count(*)                                                                 as samples,
  round(avg((properties->>'ms')::numeric))                                 as avg_ms,
  round(percentile_cont(0.5) within group (order by (properties->>'ms')::numeric)) as p50_ms,
  round(percentile_cont(0.95) within group (order by (properties->>'ms')::numeric)) as p95_ms
from public.events
where event_name = 'time_to_curation'
group by 1
order by 1 desc;

-- ---------------------------------------------------------------------------
-- curation_duration — time spent on the curation screen (mount → Finish).
-- ---------------------------------------------------------------------------
create or replace view public.v_curation_duration as
select
  date_trunc('day', server_ts)                                            as day,
  count(*)                                                                 as samples,
  round(avg((properties->>'ms')::numeric))                                 as avg_ms,
  round(percentile_cont(0.5) within group (order by (properties->>'ms')::numeric)) as p50_ms,
  round(percentile_cont(0.95) within group (order by (properties->>'ms')::numeric)) as p95_ms
from public.events
where event_name = 'curation_duration'
group by 1
order by 1 desc;

-- ---------------------------------------------------------------------------
-- toggle_count — raw keep/remove presses (effort) vs. distinct photos acted
-- on (decision breadth). A big gap means lots of second-guessing.
-- ---------------------------------------------------------------------------
create or replace view public.v_toggle_count as
select
  date_trunc('day', server_ts)                              as day,
  count(*)                                                   as sessions,
  round(avg((properties->>'presses')::numeric), 1)          as avg_presses,
  round(avg((properties->>'distinctPhotos')::numeric), 1)   as avg_distinct_photos
from public.events
where event_name = 'toggle_count'
group by 1
order by 1 desc;

-- ---------------------------------------------------------------------------
-- curation_funnel — uploaded → auto-kept (heroes) → user-kept. The scorer's
-- hit rate: if user_kept diverges hard from auto_kept, the heroes are wrong.
-- ---------------------------------------------------------------------------
create or replace view public.v_curation_funnel as
select
  date_trunc('day', server_ts)                       as day,
  count(*)                                            as sessions,
  sum((properties->>'uploaded')::int)                 as uploaded,
  sum((properties->>'autoKept')::int)                 as auto_kept,
  sum((properties->>'userKept')::int)                 as user_kept,
  -- How the user's final set compares to the auto-selected heroes (1.0 = kept
  -- exactly as many as we proposed).
  round(avg((properties->>'userKept')::numeric
            / nullif((properties->>'autoKept')::numeric, 0)), 2) as user_vs_auto,
  -- Share of the upload that survives to the kept set.
  round(avg((properties->>'userKept')::numeric
            / nullif((properties->>'uploaded')::numeric, 0)), 3) as keep_rate
from public.events
where event_name = 'curation_funnel'
group by 1
order by 1 desc;

-- ---------------------------------------------------------------------------
-- pipeline_stage_duration — one event per run carries every stage as a key
-- ({ exif: ms, dedup: ms, … }); unnest to rank stages by cost. This is where
-- you look to find the bottleneck on real collections.
-- ---------------------------------------------------------------------------
create or replace view public.v_pipeline_stage_duration as
select
  kv.key                                                                  as stage,
  count(*)                                                                 as samples,
  round(avg(kv.value::numeric))                                            as avg_ms,
  round(percentile_cont(0.5) within group (order by kv.value::numeric))    as p50_ms,
  round(percentile_cont(0.95) within group (order by kv.value::numeric))   as p95_ms
from public.events e
cross join lateral jsonb_each_text(e.properties) as kv(key, value)
where e.event_name = 'pipeline_stage_duration'
group by kv.key
order by avg_ms desc;

-- ---------------------------------------------------------------------------
-- bail_out — left curation without finishing. 'back' = pressed Back,
-- 'tab_close' = closed/hid the tab before Finish.
-- ---------------------------------------------------------------------------
create or replace view public.v_bail_out as
select
  date_trunc('day', server_ts)   as day,
  properties->>'from'            as bail_from,
  count(*)                       as bail_outs
from public.events
where event_name = 'bail_out'
group by 1, 2
order by 1 desc, 3 desc;

-- ---------------------------------------------------------------------------
-- errors — pipeline / finalize failures and compatibility-gate rejections.
-- `detail` is the error name (pipeline/finalize) or the failed check list
-- (compat) — never a raw message, so no filenames leak in.
-- ---------------------------------------------------------------------------
create or replace view public.v_errors as
select
  date_trunc('day', server_ts)                              as day,
  properties->>'source'                                     as source,
  coalesce(properties->>'name', properties->>'failed')      as detail,
  count(*)                                                  as errors
from public.events
where event_name = 'error'
group by 1, 2, 3
order by 1 desc, 4 desc;
