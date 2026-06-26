-- Beta telemetry — quality-score error analysis for the curation preselection.
--
-- The `curation_quality_errors` event carries, per session, quality-score
-- quartile histograms of the four confusion cells: how the auto-selected set
-- (pickTopK "starter") compared against what the user finally kept.
--
--                     kept        not kept
--   auto-selected     TP          FP   (we picked it, user dropped it)
--   not selected      FN          TN   (user added it, we didn't pick it)
--
-- Buckets q0..q3 are quality-score quartiles [0,.25) [.25,.5) [.5,.75) [.75,1].
-- A cell's count is the sum of its four buckets (the client sends buckets only).
--
-- See 0001_events.sql for the table + lockdown; these inherit it (read-only
-- views over an insert-only, RLS-denied table).

-- ---------------------------------------------------------------------------
-- v_curation_quality_errors — per-day precision/recall of the quality ranking,
-- plus the headline question: is mean quality of dropped picks (FP) higher than
-- kept picks (TP)? Is mean quality of rescued photos (FN) above the ignored
-- tail (TN)? If so, sharpness is the wrong selector.
-- ---------------------------------------------------------------------------
create or replace view public.v_curation_quality_errors as
with cells as (
  select
    date_trunc('day', server_ts) as day,
    (properties->>'tp_q0')::int as tp_q0, (properties->>'tp_q1')::int as tp_q1,
    (properties->>'tp_q2')::int as tp_q2, (properties->>'tp_q3')::int as tp_q3,
    (properties->>'fp_q0')::int as fp_q0, (properties->>'fp_q1')::int as fp_q1,
    (properties->>'fp_q2')::int as fp_q2, (properties->>'fp_q3')::int as fp_q3,
    (properties->>'fn_q0')::int as fn_q0, (properties->>'fn_q1')::int as fn_q1,
    (properties->>'fn_q2')::int as fn_q2, (properties->>'fn_q3')::int as fn_q3,
    (properties->>'tn_q0')::int as tn_q0, (properties->>'tn_q1')::int as tn_q1,
    (properties->>'tn_q2')::int as tn_q2, (properties->>'tn_q3')::int as tn_q3,
    coalesce((properties->>'nullQuality')::int, 0) as null_quality
  from public.events
  where event_name = 'curation_quality_errors'
),
totals as (
  select
    day,
    count(*) as sessions,
    sum(tp_q0 + tp_q1 + tp_q2 + tp_q3) as tp,
    sum(fp_q0 + fp_q1 + fp_q2 + fp_q3) as fp,
    sum(fn_q0 + fn_q1 + fn_q2 + fn_q3) as fn,
    sum(tn_q0 + tn_q1 + tn_q2 + tn_q3) as tn,
    sum(null_quality) as null_quality,
    -- bucket midpoints (0.125,0.375,0.625,0.875) for a mean-quality estimate
    sum(tp_q0*0.125 + tp_q1*0.375 + tp_q2*0.625 + tp_q3*0.875) as tp_qsum,
    sum(fp_q0*0.125 + fp_q1*0.375 + fp_q2*0.625 + fp_q3*0.875) as fp_qsum,
    sum(fn_q0*0.125 + fn_q1*0.375 + fn_q2*0.625 + fn_q3*0.875) as fn_qsum,
    sum(tn_q0*0.125 + tn_q1*0.375 + tn_q2*0.625 + tn_q3*0.875) as tn_qsum
  from cells
  group by day
)
select
  day,
  sessions,
  tp, fp, fn, tn, null_quality,
  round(tp::numeric / nullif(tp + fp, 0), 3) as precision,   -- kept / auto-selected
  round(tp::numeric / nullif(tp + fn, 0), 3) as recall,      -- auto-selected / kept
  round(tp_qsum / nullif(tp, 0), 3) as tp_mean_quality,
  round(fp_qsum / nullif(fp, 0), 3) as fp_mean_quality,      -- high => over-values sharpness
  round(fn_qsum / nullif(fn, 0), 3) as fn_mean_quality,      -- low  => misses soft keepers
  round(tn_qsum / nullif(tn, 0), 3) as tn_mean_quality
from totals
order by day desc;

-- ---------------------------------------------------------------------------
-- v_curation_quality_buckets — the full FP/FN histograms (the distribution
-- shape, not just the mean), long-form for charting. A bimodal FP set is the
-- signal a single mean would hide.
-- ---------------------------------------------------------------------------
create or replace view public.v_curation_quality_buckets as
with cells as (
  select properties as p
  from public.events
  where event_name = 'curation_quality_errors'
),
b(cell, bucket, n) as (
  select 'fp', '[0.00,0.25)', sum((p->>'fp_q0')::int) from cells
  union all select 'fp', '[0.25,0.50)', sum((p->>'fp_q1')::int) from cells
  union all select 'fp', '[0.50,0.75)', sum((p->>'fp_q2')::int) from cells
  union all select 'fp', '[0.75,1.00]', sum((p->>'fp_q3')::int) from cells
  union all select 'fn', '[0.00,0.25)', sum((p->>'fn_q0')::int) from cells
  union all select 'fn', '[0.25,0.50)', sum((p->>'fn_q1')::int) from cells
  union all select 'fn', '[0.50,0.75)', sum((p->>'fn_q2')::int) from cells
  union all select 'fn', '[0.75,1.00]', sum((p->>'fn_q3')::int) from cells
)
select cell, bucket, coalesce(n, 0) as n from b order by cell, bucket;
