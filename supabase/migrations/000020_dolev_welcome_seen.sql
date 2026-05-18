-- מעקב מגירת ברכה ראשונה מדולב אחרי כניסה ראשונה
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS dolev_welcome_seen_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.dolev_welcome_seen_at IS 'מתי המשתמש ראה את מגירת הברכה הראשונה מדולב';
