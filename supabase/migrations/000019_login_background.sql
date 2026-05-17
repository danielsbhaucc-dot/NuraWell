-- רקע עמוד התחברות (R2 + CDN Worker)
ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS login_background_key TEXT,
  ADD COLUMN IF NOT EXISTS login_background_credit JSONB;

COMMENT ON COLUMN public.site_settings.login_background_key IS 'מפתח R2: site/login-background.webp';
