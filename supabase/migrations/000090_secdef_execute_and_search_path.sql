-- Security hardening (Supabase advisors):
-- 1) SECURITY DEFINER functions must not be callable by anon/authenticated via PostgREST RPC.
--    App calls these only with the service_role client; trigger functions don't need EXECUTE grants.
--    Kept callable: is_admin(), nura_is_admin(uuid) (used inside RLS policies), challenge_public_stats().
-- 2) Fixed search_path on functions that had none.

DO $$
DECLARE
  sig text;
BEGIN
  FOREACH sig IN ARRAY ARRAY[
    'public.challenge_enrollment_guard_demo()',
    'public.claim_ops_auth_ticket(uuid)',
    'public.count_guardian_sos_events_for_local_date(uuid, text, date)',
    'public.ensure_challenge_ops_schema()',
    'public.handle_new_user()',
    'public.insert_ops_auth_ticket(text, text, timestamp with time zone)',
    'public.profiles_block_role_self_update()',
    'public.rls_auto_enable()',
    'public.almog_kickoff_state_counts()',
    'public.increment_notification_count(uuid)',
    'public.touch_last_responded_at(uuid)'
  ] LOOP
    IF to_regprocedure(sig) IS NOT NULL THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', sig);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', sig);
    END IF;
  END LOOP;

  FOREACH sig IN ARRAY ARRAY[
    'public.almog_kickoff_state_counts()',
    'public._almog_kickoff_status_touch()',
    'public.set_chat_periodic_summaries_updated_at()',
    'public.set_periodic_summaries_updated_at()',
    'public.sync_user_insight_is_active_from_status()',
    'public.touch_notification_fall_episode_updated_at()',
    'public.touch_user_memory_dossier_updated_at()'
  ] LOOP
    IF to_regprocedure(sig) IS NOT NULL THEN
      EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', sig);
    END IF;
  END LOOP;
END $$;
