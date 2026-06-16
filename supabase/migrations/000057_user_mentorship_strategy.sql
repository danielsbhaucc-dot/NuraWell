-- ============================================================
-- NuraWell — Synthesis & Strategy Engine
-- Migration: 000057_user_mentorship_strategy.sql
--
-- פרופיל מנטור מאוחד — עמודות שטוחות לסינתזה מ-user_insights.
-- מוזרק לצ'אט דרך <CURRENT_USER_STRATEGY> ול-UI דרך DynamicMentorWidget.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_mentorship_strategy (
  user_id                 UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  psychological_approach  TEXT NOT NULL DEFAULT '',
  active_blockers         TEXT[] NOT NULL DEFAULT '{}',
  current_focus           TEXT[] NOT NULL DEFAULT '{}',
  medical_red_flags       TEXT[] NOT NULL DEFAULT '{}',
  next_best_action        TEXT NOT NULL DEFAULT '',
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.user_mentorship_strategy IS
  'Unified mentorship strategy synthesized from user_insights. Drives AI chat behavior and adaptive dashboard UI.';

CREATE INDEX IF NOT EXISTS idx_user_mentorship_strategy_updated_at
  ON public.user_mentorship_strategy (updated_at DESC);

CREATE OR REPLACE TRIGGER update_user_mentorship_strategy_updated_at
  BEFORE UPDATE ON public.user_mentorship_strategy
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.user_mentorship_strategy ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_mentorship_strategy_select_own ON public.user_mentorship_strategy;
CREATE POLICY user_mentorship_strategy_select_own
  ON public.user_mentorship_strategy FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS user_mentorship_strategy_admin_read ON public.user_mentorship_strategy;
CREATE POLICY user_mentorship_strategy_admin_read
  ON public.user_mentorship_strategy FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS user_mentorship_strategy_service_role_all ON public.user_mentorship_strategy;
CREATE POLICY user_mentorship_strategy_service_role_all
  ON public.user_mentorship_strategy FOR ALL TO service_role
  USING (TRUE) WITH CHECK (TRUE);
