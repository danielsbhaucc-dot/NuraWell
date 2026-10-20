-- DB slimming, stage 1 (approved by owner 2026-10-20).
-- Drops only non-unique, non-constraint indexes that are exact duplicates or
-- strict left-prefixes of another index on the same table. Unique/constraint
-- indexes are kept. Original definitions backed up outside the repo.

drop index if exists public.media_provenance_assets_search_trgm;      -- = media_prov_search_trgm
drop index if exists public.idx_error_events_created;                 -- = error_events_created_idx
drop index if exists public.idx_ai_interactions_user_id;              -- ⊂ idx_ai_interactions_user_created
drop index if exists public.idx_ai_interactions_session_id;           -- ⊂ idx_ai_interactions_session_created
drop index if exists public.idx_notifications_user_id;                -- ⊂ idx_notifications_user_inbox
drop index if exists public.idx_journey_progress_user;                -- ⊂ unique (user_id, step_id)
drop index if exists public.idx_task_exec_user_step;                  -- ⊂ idx_task_exec_user_step_date
drop index if exists public.idx_task_exec_user_date;                  -- ⊂ idx_task_exec_user_outcome
drop index if exists public.idx_lesson_progress_user;                 -- ⊂ unique (user_id, lesson_id)
drop index if exists public.idx_enrollments_user;                     -- ⊂ unique (user_id, course_id)
drop index if exists public.idx_task_logs_user_date;                  -- = unique (user_id, date_key)
drop index if exists public.idx_notification_logs_user_date;          -- ⊂ unique (user_id, date_key, time_of_day)
drop index if exists public.idx_periodic_summaries_user_type_period;  -- = unique (user_id, type, period_key)
drop index if exists public.idx_chat_periodic_summaries_user_type_period; -- = unique
drop index if exists public.idx_daily_action_instances_user_date;     -- = unique (user_id, date_key)

-- Faster, usually smaller TOAST compression for large text/jsonb columns.
alter table public.ai_interactions alter column content set compression lz4;
alter table public.ai_interactions alter column metadata set compression lz4;
alter table public.notifications alter column metadata set compression lz4;
alter table public.media_evidence alter column payload_json set compression lz4;
alter table public.media_evidence_attestations alter column payload set compression lz4;
alter table public.error_events alter column stack set compression lz4;
alter table public.pending_chat_logs alter column raw_chat_text set compression lz4;

-- Note: run once outside a transaction after applying (not part of migration):
--   VACUUM (FULL, ANALYZE) public.ai_interactions;
