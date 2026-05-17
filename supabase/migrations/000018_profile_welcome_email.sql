-- מעקב מייל ברכה מאלמוג אחרי אימות
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS welcome_email_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.welcome_email_sent_at IS 'מתי נשלח מייל ברכה מאלמוג אחרי אימות אימייל';
