-- ============================================================
-- NuraWell — Onboarding & registration background
-- Extends profiles with AI follow-up fields (replaces separate user_profiles)
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS main_goal TEXT
    CHECK (main_goal IS NULL OR main_goal IN ('weight_loss', 'healthy_lifestyle', 'both')),
  ADD COLUMN IF NOT EXISTS weakest_time_of_day TEXT
    CHECK (weakest_time_of_day IS NULL OR weakest_time_of_day IN ('morning', 'noon', 'afternoon', 'evening_night')),
  ADD COLUMN IF NOT EXISTS main_obstacle TEXT
    CHECK (main_obstacle IS NULL OR main_obstacle IN ('no_time', 'emotional_eating', 'lack_of_consistency', 'no_support', 'other')),
  ADD COLUMN IF NOT EXISTS main_obstacle_detail TEXT,
  ADD COLUMN IF NOT EXISTS wake_up_time TIME,
  ADD COLUMN IF NOT EXISTS sleep_time TIME,
  ADD COLUMN IF NOT EXISTS preferred_channel TEXT
    CHECK (preferred_channel IS NULL OR preferred_channel IN ('whatsapp', 'in_app', 'phone')),
  ADD COLUMN IF NOT EXISTS ai_check_in_times TIME[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS ai_system_prompt TEXT;

COMMENT ON COLUMN public.profiles.main_goal IS 'מטרה עיקרית מההרשמה';
COMMENT ON COLUMN public.profiles.weakest_time_of_day IS 'חלון יום קשה לתזונה — לתזמון follow-up';
COMMENT ON COLUMN public.profiles.ai_check_in_times IS 'שלושה זמני בדיקה יומיים מחושבים (Asia/Jerusalem)';

-- רקע עמוד הרשמה (R2 + CDN)
ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS register_background_key TEXT,
  ADD COLUMN IF NOT EXISTS register_background_credit JSONB;

COMMENT ON COLUMN public.site_settings.register_background_key IS 'מפתח R2: site/register-background.webp';

CREATE INDEX IF NOT EXISTS idx_profiles_onboarding_incomplete
  ON public.profiles (onboarding_completed)
  WHERE onboarding_completed IS NOT TRUE;
