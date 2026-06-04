-- ============================================================
-- NuraWell — Audio playlists (lesson background music)
-- Migration: 000033_audio_playlists.sql
--
-- Description:
--   תשתית מוזיקת רקע לשיעורי המסע. שתי טבלאות חדשות:
--
--     1) audio_playlists — אוסף רצועות בעל שם, עם דגל פרסום.
--     2) audio_tracks    — רצועת אודיו בודדת (מאוחסנת ב-R2 דלי AUDIO,
--                          מוגשת דרך ה-Worker בנתיב /audio/*). כל רצועה
--                          נושאת קרדיט (jsonb): מקור (Pixabay וכו'),
--                          יוצר/אמן, קישור ורישיון.
--
--   journey_steps.audio_playlist_id — שיוך פלייליסט לכל צעד (per-step).
--
--   RLS: משתמשים מחוברים יכולים לקרוא פלייליסטים *published* ואת הרצועות
--   שלהם (כדי שהשיעור ינגן רקע). כל הכתיבה עוברת דרך service_role
--   (admin API), לכן אין policies ל-INSERT/UPDATE/DELETE ל-authenticated.
--
--   הערה: idempotent (IF NOT EXISTS / DROP POLICY IF EXISTS).
-- ============================================================

-- ============================================================
-- 1. audio_playlists
-- ============================================================
CREATE TABLE IF NOT EXISTS public.audio_playlists (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT        NOT NULL,
  description  TEXT,
  is_published BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 2. audio_tracks
-- ============================================================
CREATE TABLE IF NOT EXISTS public.audio_tracks (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id      UUID        NOT NULL REFERENCES public.audio_playlists(id) ON DELETE CASCADE,
  title            TEXT        NOT NULL,
  object_key       TEXT        NOT NULL,
  mime_type        TEXT        NOT NULL DEFAULT 'audio/mpeg',
  duration_seconds NUMERIC,
  size_bytes       BIGINT,
  sort_order       INTEGER     NOT NULL DEFAULT 0,
  -- קרדיט: { source, author, title, link, license }
  credit           JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audio_tracks_playlist_order_idx
  ON public.audio_tracks (playlist_id, sort_order);

-- ============================================================
-- 3. journey_steps.audio_playlist_id (per-step assignment)
-- ============================================================
ALTER TABLE public.journey_steps
  ADD COLUMN IF NOT EXISTS audio_playlist_id UUID
  REFERENCES public.audio_playlists(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS journey_steps_audio_playlist_idx
  ON public.journey_steps (audio_playlist_id);

-- ============================================================
-- 4. Grants (PostgREST צריך grants ברמת טבלה בנוסף ל-RLS)
-- ============================================================
GRANT SELECT ON public.audio_playlists TO authenticated;
GRANT SELECT ON public.audio_tracks    TO authenticated;
GRANT ALL    ON public.audio_playlists TO service_role;
GRANT ALL    ON public.audio_tracks    TO service_role;

-- ============================================================
-- 5. RLS — קריאה ל-authenticated רק לפלייליסטים published
-- ============================================================
ALTER TABLE public.audio_playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audio_tracks    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_read_published_playlists" ON public.audio_playlists;
CREATE POLICY "authenticated_read_published_playlists" ON public.audio_playlists
  FOR SELECT
  TO authenticated
  USING (is_published = TRUE OR public.is_admin());

DROP POLICY IF EXISTS "authenticated_read_published_tracks" ON public.audio_tracks;
CREATE POLICY "authenticated_read_published_tracks" ON public.audio_tracks
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.audio_playlists p
      WHERE p.id = audio_tracks.playlist_id
        AND p.is_published = TRUE
    )
  );

COMMENT ON TABLE public.audio_playlists IS
  'פלייליסטים של מוזיקת רקע לשיעורי המסע. כתיבה דרך service_role (admin API) בלבד.';
COMMENT ON TABLE public.audio_tracks IS
  'רצועות אודיו (R2 דלי AUDIO, מוגש ב-/audio/*). credit jsonb: source/author/title/link/license.';
COMMENT ON COLUMN public.journey_steps.audio_playlist_id IS
  'פלייליסט מוזיקת רקע שינוגן לאורך הצעד (מהשלב הראשון ועד הסיכום). NULL = ללא מוזיקה.';
