-- Make all analysis views SECURITY INVOKER (issue: Supabase advisor flagged
-- "Security Definer View" on public.v_photos_uploaded and friends).
--
-- By default a Postgres view runs with the permissions and RLS of its OWNER,
-- not the querying role. For views over public.events — which is RLS-enabled
-- with no policies (see 0001_events.sql) — that means a view could become a
-- read path around RLS for any role granted SELECT on it. We don't rely on
-- that: these views are read by the dashboard / service_role, both of which
-- bypass RLS in their own right. Flipping the views to security_invoker makes
-- the trust boundary explicit and silences the advisor: a client role now
-- hits the (empty) RLS wall on events instead of reading through the view.
--
-- security_invoker requires Postgres 15+ (Supabase is well past this). The
-- setting only changes whose permissions/RLS apply; the view bodies are
-- untouched, so no need to restate the queries here.

-- 0001_events.sql
alter view public.v_photos_uploaded set (security_invoker = true);

-- 0002_metric_views.sql
alter view public.v_time_to_curation       set (security_invoker = true);
alter view public.v_curation_duration      set (security_invoker = true);
alter view public.v_toggle_count           set (security_invoker = true);
alter view public.v_curation_funnel        set (security_invoker = true);
alter view public.v_pipeline_stage_duration set (security_invoker = true);
alter view public.v_bail_out               set (security_invoker = true);
alter view public.v_errors                 set (security_invoker = true);

-- 0003_curation_quality_errors.sql
alter view public.v_curation_quality_errors  set (security_invoker = true);
alter view public.v_curation_quality_buckets set (security_invoker = true);
