-- רקע ה-HERO בצ'אט אלמוג (נפרד מרקע התחברות)
ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS chat_background_key TEXT,
  ADD COLUMN IF NOT EXISTS chat_background_credit JSONB;

COMMENT ON COLUMN public.site_settings.chat_background_key IS 'מפתח R2: site/chat-background.webp';
COMMENT ON COLUMN public.site_settings.chat_background_credit IS 'קרדיט תמונה (Pixabay/Pexels)';
