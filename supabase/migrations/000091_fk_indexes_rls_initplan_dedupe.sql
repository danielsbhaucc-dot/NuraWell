-- 000091: DB performance audit fixes (no behavior change)
-- 1) covering indexes for unindexed foreign keys
create index if not exists idx_almog_assignments_related_step_id_fk on public.almog_assignments (related_step_id);
create index if not exists idx_almog_blockers_related_assignment_id_fk on public.almog_blockers (related_assignment_id);
create index if not exists idx_almog_interventions_assignment_id_fk on public.almog_interventions (assignment_id);
create index if not exists idx_almog_knowledge_created_by_fk on public.almog_knowledge (created_by);
create index if not exists idx_challenge_admin_audit_log_admin_user_id_fk on public.challenge_admin_audit_log (admin_user_id);
create index if not exists idx_challenge_enrollments_campaign_id_fk on public.challenge_enrollments (campaign_id);
create index if not exists idx_challenge_success_events_user_id_fk on public.challenge_success_events (user_id);
create index if not exists idx_challenge_task_completions_user_id_fk on public.challenge_task_completions (user_id);
create index if not exists idx_challenge_task_completions_task_definition_id_fk on public.challenge_task_completions (task_definition_id);
create index if not exists idx_chat_transcript_access_requests_cancelled_by_admin_id_fk on public.chat_transcript_access_requests (cancelled_by_admin_id);
create index if not exists idx_chat_transcript_access_requests_admin_user_id_fk on public.chat_transcript_access_requests (admin_user_id);
create index if not exists idx_chat_transcript_access_requests_notification_id_fk on public.chat_transcript_access_requests (notification_id);
create index if not exists idx_churn_feedback_notification_id_fk on public.churn_feedback (notification_id);
create index if not exists idx_courses_created_by_fk on public.courses (created_by);
create index if not exists idx_journey_task_executions_step_id_fk on public.journey_task_executions (step_id);
create index if not exists idx_media_assets_created_by_fk on public.media_assets (created_by);
create index if not exists idx_scheduled_reminders_assignment_id_fk on public.scheduled_reminders (assignment_id);
create index if not exists idx_user_journey_step_unlocks_step_id_fk on public.user_journey_step_unlocks (step_id);
create index if not exists idx_user_memories_source_session_id_fk on public.user_memories (source_session_id);

-- 2) RLS: evaluate auth.uid() once per statement instead of per row.
--    ALTER POLICY keeps roles/command/permissiveness; expressions are semantically identical.
do $$
declare r record; q text; w text;
begin
  for r in
    select tablename, policyname, qual, with_check from pg_policies
    where schemaname = 'public'
      and ((qual ~ 'auth\.uid\(\)' and qual !~* 'select auth\.uid\(\)')
        or (with_check ~ 'auth\.uid\(\)' and with_check !~* 'select auth\.uid\(\)'))
  loop
    q := case when r.qual is null then null else replace(r.qual, 'auth.uid()', '( SELECT auth.uid() AS uid)') end;
    w := case when r.with_check is null then null else replace(r.with_check, 'auth.uid()', '( SELECT auth.uid() AS uid)') end;
    execute format('alter policy %I on public.%I', r.policyname, r.tablename)
      || coalesce(' using (' || q || ')', '')
      || coalesce(' with check (' || w || ')', '');
  end loop;
end $$;

-- 3) exact duplicate permissive policies: an ALL policy with the identical admin predicate and
--    roles already grants SELECT, so the separate SELECT policy is redundant (access unchanged).
drop policy if exists admins_view_chat_sessions on public.chat_sessions;
drop policy if exists admins_view_notification_logs on public.notification_logs;
