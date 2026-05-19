-- מעקב מגירת היכרות ראשונה מאלמוג (אחרי ברכת דולב)

ALTER TABLE public.profiles

  ADD COLUMN IF NOT EXISTS almog_welcome_seen_at TIMESTAMPTZ;



COMMENT ON COLUMN public.profiles.almog_welcome_seen_at IS 'מתי המשתמש ראה את מגירת ההיכרות הראשונה מאלמוג';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS almog_intro_email_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.almog_intro_email_sent_at IS 'מייל היכרות ראשון מאלמוג (אחרי מגירת ברכה)';

