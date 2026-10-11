-- Inactivity/notification crons: cheap "who is eligible" lookups.
--  * admins are excluded from notification crons unless they opt in as a test user
--    (profiles.notify_test_opt_in = true, or env NOTIFY_TEST_USER_IDS).
--  * partial index so the eligibility count / id lookup is an index-only scan.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notify_test_opt_in BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.notify_test_opt_in IS
  'Test opt-in: when true, an admin account still receives automatic notifications (cron/inactivity) for verification.';

CREATE INDEX IF NOT EXISTS idx_profiles_notify_eligible_onboarded
  ON public.profiles (id)
  WHERE onboarding_completed = true AND (role <> 'admin' OR notify_test_opt_in = true);

CREATE INDEX IF NOT EXISTS idx_profiles_notify_eligible_churned
  ON public.profiles (id)
  WHERE engagement_status = 'churned' AND (role <> 'admin' OR notify_test_opt_in = true);

-- today's executions per user (habit-checkpoints scoped lookups)
CREATE INDEX IF NOT EXISTS idx_task_exec_date_user
  ON public.journey_task_executions (date_key, user_id);
