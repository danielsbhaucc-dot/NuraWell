-- ============================================================
-- NuraWell — User Memory Dossier
-- Migration: 000043_user_memory_dossier.sql
--
-- תיק זיכרון מובנה למשתמש — מקור אמת מבני לתובנות ש-Llama 4 מחלץ.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_memory_dossier (
  user_id           UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  tags              JSONB NOT NULL DEFAULT '[]'::jsonb,
  essentials        JSONB NOT NULL DEFAULT '{}'::jsonb,
  goals             JSONB NOT NULL DEFAULT '{}'::jsonb,
  task_memory       JSONB NOT NULL DEFAULT '{}'::jsonb,
  habit_memory      JSONB NOT NULL DEFAULT '{}'::jsonb,
  schedule_memory   JSONB NOT NULL DEFAULT '{}'::jsonb,
  personal_context  JSONB NOT NULL DEFAULT '{}'::jsonb,
  health_context    JSONB NOT NULL DEFAULT '{}'::jsonb,
  psychology        JSONB NOT NULL DEFAULT '{}'::jsonb,
  coaching_profile  JSONB NOT NULL DEFAULT '{}'::jsonb,
  risk_signals      JSONB NOT NULL DEFAULT '{}'::jsonb,
  inferred_insights JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_stats      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.user_memory_dossier IS
  'Structured user memory dossier extracted by Llama 4 background pipeline — tags, patterns, goals, tasks, habits, insights.';

CREATE INDEX IF NOT EXISTS idx_user_memory_dossier_updated_at
  ON public.user_memory_dossier (updated_at DESC);

ALTER TABLE public.user_memory_dossier ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_memory_dossier_select_own ON public.user_memory_dossier;
CREATE POLICY user_memory_dossier_select_own
  ON public.user_memory_dossier
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- כתיבה רק דרך service role (admin client) — אין policy INSERT/UPDATE ל-authenticated

CREATE OR REPLACE FUNCTION public.touch_user_memory_dossier_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_memory_dossier_updated_at ON public.user_memory_dossier;
CREATE TRIGGER trg_user_memory_dossier_updated_at
  BEFORE UPDATE ON public.user_memory_dossier
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_user_memory_dossier_updated_at();
