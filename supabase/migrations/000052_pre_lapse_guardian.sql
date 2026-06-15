-- ============================================================
-- NuraWell — Pre-Lapse Guardian
-- Migration: 000052_pre_lapse_guardian.sql
--
-- SOS event log for learning, anti-obsession, and analytics.
-- Important: no date_key column. Daily counts must be derived from
-- created_at in the user's product timezone, e.g.:
--   (created_at AT TIME ZONE 'Asia/Jerusalem')::date = CURRENT_DATE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.guardian_sos_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  trigger TEXT,
  strategy_offered TEXT,
  outcome TEXT NOT NULL DEFAULT 'unknown'
    CHECK (outcome IN ('passed', 'fell', 'unknown', 'escalated')),
  red_flag BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.guardian_sos_events IS
  'SOS events for Pre-Lapse Guardian learning, anti-obsession limits, and analytics. Daily counts are derived from created_at, not a stored date_key.';

COMMENT ON COLUMN public.guardian_sos_events.trigger IS
  'FrictionCategory identified by the SOS flow, e.g. emotional|logistical|physiological.';

COMMENT ON COLUMN public.guardian_sos_events.strategy_offered IS
  'StrategyType offered by the intervention engine or deterministic fallback.';

COMMENT ON COLUMN public.guardian_sos_events.red_flag IS
  'True when crisis-detector escalated the event instead of behavioral intervention.';

COMMENT ON COLUMN public.guardian_sos_events.created_at IS
  'Source of truth for daily SOS counting via created_at AT TIME ZONE user timezone.';

CREATE INDEX IF NOT EXISTS idx_guardian_sos_events_user_created
  ON public.guardian_sos_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_guardian_sos_events_red_flag_created
  ON public.guardian_sos_events (created_at DESC)
  WHERE red_flag = TRUE;

ALTER TABLE public.guardian_sos_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS guardian_sos_events_insert_own ON public.guardian_sos_events;
CREATE POLICY guardian_sos_events_insert_own
  ON public.guardian_sos_events FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS guardian_sos_events_select_own ON public.guardian_sos_events;
CREATE POLICY guardian_sos_events_select_own
  ON public.guardian_sos_events FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
