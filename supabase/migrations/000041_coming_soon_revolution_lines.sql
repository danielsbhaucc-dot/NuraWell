-- ============================================================
-- NuraWell — משפטי בלופ לעמוד "בקרוב"
-- Migration: 000041_coming_soon_revolution_lines.sql
--
-- Description:
--   מערך משפטי שיווק/פסיכולוגיה שמוצגים בלופ אחרי השיר.
--   *כוכביות* סביב מילה = הדגשה ויזואלית בעמוד.
--   RLS קיים (SELECT לכולם, UPDATE ל-admin) — אין צורך בשינוי.
-- ============================================================

ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS coming_soon_revolution_lines JSONB;

COMMENT ON COLUMN public.site_settings.coming_soon_revolution_lines IS
  'משפטי בלופ לעמוד "בקרוב": מערך מחרוזות, *מילה* = הדגשה.';
