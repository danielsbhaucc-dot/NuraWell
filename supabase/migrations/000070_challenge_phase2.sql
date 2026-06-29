-- ============================================================
-- NuraWell — Challenge phase 2: interview, intro TTS, OPS
-- Migration: 000070_challenge_phase2.sql
-- ============================================================

-- ── Bootstrap site_settings (אם 000006 / 000069 לא הורצו) ───
CREATE TABLE IF NOT EXISTS public.site_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CONSTRAINT site_settings_single_row CHECK (id = 1),
  public_app_url TEXT NOT NULL DEFAULT 'https://nurawell.vercel.app',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.site_settings (id, public_app_url)
VALUES (1, 'https://nurawell.vercel.app')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS challenge_enabled BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS challenge_intro_lines JSONB,
  ADD COLUMN IF NOT EXISTS challenge_intro_tts_url TEXT,
  ADD COLUMN IF NOT EXISTS challenge_intro_tts_text TEXT;

COMMENT ON COLUMN public.site_settings.challenge_intro_lines IS
  'Personalized intro text lines shown after opening song [{text, emphasis?}]';
COMMENT ON COLUMN public.site_settings.challenge_intro_tts_url IS
  'ElevenLabs TTS URL for challenge intro narration (CDN)';
COMMENT ON COLUMN public.site_settings.challenge_intro_tts_text IS
  'Source text used to generate challenge_intro_tts_url';

-- אם 000069 לא הורצה — פונקציית admin בטוחה ל-enum
CREATE OR REPLACE FUNCTION public.nura_is_admin(uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = uid
      AND lower(btrim(p.role::text)) IN (
        'admin', 'administrator', 'super_admin', 'superadmin', 'owner', 'ops'
      )
  );
$$;

-- ── challenge_interview_sessions ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.challenge_interview_sessions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id       UUID NOT NULL REFERENCES public.challenge_enrollments(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  transcript          JSONB NOT NULL DEFAULT '[]'::jsonb,
  extracted_insights  JSONB NOT NULL DEFAULT '{}'::jsonb,
  completed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_challenge_interview_enrollment
  ON public.challenge_interview_sessions (enrollment_id);

CREATE INDEX IF NOT EXISTS idx_challenge_interview_user
  ON public.challenge_interview_sessions (user_id);

ALTER TABLE public.challenge_interview_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "challenge_interview_select_own"
  ON public.challenge_interview_sessions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "challenge_interview_insert_own"
  ON public.challenge_interview_sessions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "challenge_interview_update_own"
  ON public.challenge_interview_sessions FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "challenge_interview_admin_all"
  ON public.challenge_interview_sessions FOR ALL TO authenticated
  USING (public.nura_is_admin())
  WITH CHECK (public.nura_is_admin());

-- ברירת מחדל לשורות פתיחה
UPDATE public.site_settings
SET challenge_intro_lines = COALESCE(
  challenge_intro_lines,
  '[
    {"text": "היי {firstName}, נעים להכיר — אני אלמוג!"},
    {"text": "ב-14 הימים הקרובים אני איתך צעד-צעד — *בלי דיאטות קיצוניות*, רק שינוי אמיתי."},
    {"text": "כל יום תקבל/י משימות קטנות שמוכחות שעובדות. *ההצלחה שלך לא נמדדת רק במשקל*."},
    {"text": "מוכן/ה? בוא/י נתחיל."}
  ]'::jsonb
)
WHERE id = 1;
