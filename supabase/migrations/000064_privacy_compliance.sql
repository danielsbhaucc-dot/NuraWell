-- ============================================================
-- NuraWell — Privacy compliance (Amendment 13 readiness)
-- Migration: 000064_privacy_compliance.sql
--
-- user_consents audit trail + profile consent timestamps
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS privacy_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS health_data_consent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS parental_consent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS accepted_policy_version TEXT;

COMMENT ON COLUMN public.profiles.terms_accepted_at IS
  'מועד אישור תנאי שימוש אחרון';
COMMENT ON COLUMN public.profiles.privacy_accepted_at IS
  'מועד אישור מדיניות פרטיות אחרון';
COMMENT ON COLUMN public.profiles.health_data_consent_at IS
  'מועד הסכמה לאיסוף מידע בריאותי/גוף';
COMMENT ON COLUMN public.profiles.parental_consent_at IS
  'מועד הצהרת הסכמת הורה (16–17)';
COMMENT ON COLUMN public.profiles.accepted_policy_version IS
  'גרסת מסמכים משפטיים שאושרו';

CREATE TABLE IF NOT EXISTS public.user_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  consent_type TEXT NOT NULL,
  granted BOOLEAN NOT NULL,
  policy_version TEXT NOT NULL,
  source TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_consents_type_check CHECK (
    consent_type IN (
      'terms',
      'privacy',
      'health_data',
      'parental_guardian',
      'age_declaration',
      'marketing',
      'push_notifications',
      'guardian_opt_in'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_user_consents_user_created
  ON public.user_consents (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_consents_user_type
  ON public.user_consents (user_id, consent_type, created_at DESC);

ALTER TABLE public.user_consents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_consents_select_own ON public.user_consents;
CREATE POLICY user_consents_select_own
  ON public.user_consents
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

COMMENT ON TABLE public.user_consents IS
  'יומן הסכמות — כתיבה דרך service role בלבד (server actions / API)';
