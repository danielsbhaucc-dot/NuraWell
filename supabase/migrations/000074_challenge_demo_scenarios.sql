-- ============================================================
-- NuraWell — Challenge: demo scenarios wrap_up + full
-- Migration: 000074_challenge_demo_scenarios.sql
-- ============================================================

ALTER TABLE public.challenge_enrollments
  DROP CONSTRAINT IF EXISTS challenge_enrollments_demo_scenario_check;

ALTER TABLE public.challenge_enrollments
  ADD CONSTRAINT challenge_enrollments_demo_scenario_check
  CHECK (
    demo_scenario IS NULL
    OR demo_scenario IN ('waiting', 'intro', 'active', 'wrap_up', 'full')
  );
