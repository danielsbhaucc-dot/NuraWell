-- ============================================================
-- NuraWell — Churn / Re-engagement
-- Migration: 000044_churn_reengagement.sql
--
-- שכבת נטישה והחזרת משתמשים (ספק docs/CHURN_REENGAGEMENT_SPEC.md):
--   1. engagement_status persisted על profiles (analytics + gating).
--   2. טבלת churn_feedback ל-Exit Survey (יום 10, רוכב על breakup).
--
-- ai_context.reengagement נשמר ב-JSONB הקיים (profiles.ai_context) — אין צורך
-- בעמודה נפרדת, עקבי עם avoid_push / web_push.
-- ============================================================

-- ── engagement_status persisted ────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS engagement_status TEXT
    CHECK (engagement_status IS NULL OR engagement_status IN (
      'active', 'slipping', 'at_risk', 'dormant', 'churned'
    ))
    DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS engagement_status_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_profiles_engagement_status
  ON public.profiles (engagement_status)
  WHERE engagement_status IS NOT NULL AND engagement_status != 'active';

COMMENT ON COLUMN public.profiles.engagement_status IS
  'מצב מעורבות persisted: active|slipping|at_risk|dormant|churned. מתעדכן ב-habit-checkpoints cron.';

-- ── Exit survey responses ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.churn_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK (reason IN (
    'too_busy', 'too_hard', 'no_results', 'personal', 'other'
  )),
  detail TEXT,
  notification_id UUID REFERENCES public.notifications(id) ON DELETE SET NULL,
  days_since_last_active INTEGER,
  engagement_status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_churn_feedback_user_created
  ON public.churn_feedback (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_churn_feedback_reason
  ON public.churn_feedback (reason, created_at DESC);

COMMENT ON TABLE public.churn_feedback IS
  'Exit Survey — סיבות נטישה שנאספות ביום 10 (breakup). תשובות דרך quick-reply buttons.';

ALTER TABLE public.churn_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS churn_feedback_insert_own ON public.churn_feedback;
CREATE POLICY churn_feedback_insert_own ON public.churn_feedback
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS churn_feedback_select_own ON public.churn_feedback;
CREATE POLICY churn_feedback_select_own ON public.churn_feedback
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
