-- journey_progress.habit_meta (000024) is missing in prod, yet the journey report, journey-report API and
-- snapshot select it. PostgREST then errors and the report sees NO progress for anyone (e.g. the mandatory
-- station counts as incomplete → "קודם נשלים את תחנת החובה" for users who finished it). Restore it (idempotent).
alter table public.journey_progress
  add column if not exists habit_meta jsonb not null default '{}'::jsonb;
comment on column public.journey_progress.habit_meta is
  'Per-habit tracking: { habitId: { target_days, streak_current, streak_best, achieved_at, extended_by, opted_out } }';
notify pgrst, 'reload schema';
