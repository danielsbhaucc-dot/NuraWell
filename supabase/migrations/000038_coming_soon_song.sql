-- ============================================================
-- NuraWell — "בקרוב" (Coming Soon) experience song
-- Migration: 000038_coming_soon_song.sql
--
-- Description:
--   שיר ה-30 שניות (נוצר ב-Gemini) שמנגן בעמוד ה"בקרוב" עם
--   מילות שיר מסונכרנות. נבחר מלוח הבקרה (ספריית מדיה → אודיו).
--   נשמר כ-URL ציבורי + כותרת על השורה היחידה id=1 של site_settings.
--
--   RLS: site_settings כבר מאפשר SELECT ל-anon/authenticated (עמוד ציבורי),
--   ו-UPDATE רק ל-admin. אין צורך בפוליסות נוספות.
-- ============================================================

ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS coming_soon_song_url   TEXT,
  ADD COLUMN IF NOT EXISTS coming_soon_song_title TEXT;

COMMENT ON COLUMN public.site_settings.coming_soon_song_url IS
  'URL ציבורי (CDN) לשיר עמוד "בקרוב". נבחר מספריית המדיה (אודיו) בלוח הבקרה.';
COMMENT ON COLUMN public.site_settings.coming_soon_song_title IS
  'כותרת תצוגה לשיר עמוד "בקרוב".';
