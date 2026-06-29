-- ============================================================
-- NuraWell — Challenge OPS schema bootstrap (idempotent)
-- Migration: 000075_challenge_ops_schema.sql
-- ============================================================
-- מוסיף עמודות challenge חסרות ב-site_settings / enrollments
-- ומאפשר ל-API (service role) לתקן סכמה ישן אחרי הרצה חלקית של 069–071.

CREATE OR REPLACE FUNCTION public.ensure_challenge_ops_schema()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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

  ALTER TABLE public.site_settings
    ADD COLUMN IF NOT EXISTS challenge_eating_window_lesson JSONB;

  CREATE TABLE IF NOT EXISTS public.challenge_campaigns (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug            TEXT NOT NULL UNIQUE,
    title           TEXT NOT NULL,
    duration_days   SMALLINT NOT NULL DEFAULT 14 CHECK (duration_days > 0 AND duration_days <= 90),
    is_active       BOOLEAN NOT NULL DEFAULT false,
    config          JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS public.challenge_enrollments (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id               UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    campaign_id           UUID NOT NULL REFERENCES public.challenge_campaigns(id) ON DELETE RESTRICT,
    registered_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    challenge_start_date  DATE NOT NULL,
    challenge_end_date    DATE NOT NULL,
    status                TEXT NOT NULL DEFAULT 'waiting'
                            CHECK (status IN ('waiting', 'active', 'completed', 'dropped')),
    eating_window         JSONB,
    intro_completed_at    TIMESTAMPTZ,
    interview_completed_at TIMESTAMPTZ,
    is_demo               BOOLEAN NOT NULL DEFAULT false,
    demo_scenario         TEXT,
    demo_simulated_day    SMALLINT,
    metadata              JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT challenge_enrollments_dates CHECK (challenge_end_date >= challenge_start_date)
  );

  ALTER TABLE public.challenge_enrollments
    ADD COLUMN IF NOT EXISTS wrap_up_seen_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS completion_summary JSONB;

  ALTER TABLE public.challenge_enrollments
    DROP CONSTRAINT IF EXISTS challenge_enrollments_demo_scenario_check;

  ALTER TABLE public.challenge_enrollments
    ADD CONSTRAINT challenge_enrollments_demo_scenario_check
    CHECK (
      demo_scenario IS NULL
      OR demo_scenario IN ('waiting', 'intro', 'active', 'wrap_up', 'full')
    );

  PERFORM pg_notify('pgrst', 'reload schema');
END;
$$;

COMMENT ON FUNCTION public.ensure_challenge_ops_schema() IS
  'Idempotent challenge OPS schema repair — safe to call from service-role API.';

REVOKE ALL ON FUNCTION public.ensure_challenge_ops_schema() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_challenge_ops_schema() TO service_role;

SELECT public.ensure_challenge_ops_schema();
