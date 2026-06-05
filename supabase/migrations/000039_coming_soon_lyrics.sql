-- ============================================================
-- NuraWell — תזמוני מילות השיר לעמוד "בקרוב"
-- Migration: 000039_coming_soon_lyrics.sql
--
-- Description:
--   תזמון מסונכרן של שורות השיר (נערך ממערכת הסנכרון בלוח הבקרה).
--   נשמר כ-jsonb על השורה היחידה id=1 של site_settings:
--     { "syncOffset": number, "lines": [{ "text","start","kind","tag" }] }
--   RLS קיים (SELECT לכולם, UPDATE ל-admin) — אין צורך בשינוי.
-- ============================================================

ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS coming_soon_lyrics JSONB;

COMMENT ON COLUMN public.site_settings.coming_soon_lyrics IS
  'תזמוני מילות השיר לעמוד "בקרוב": { syncOffset, lines:[{text,start,kind,tag}] }.';
