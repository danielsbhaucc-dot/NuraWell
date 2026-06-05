-- ============================================================
-- NuraWell — Video View Events (Bunny cost tracking)
-- Migration: 000037_video_view_events.sql
-- Description:
--   טבלת אירועי-צפייה בוידאו, כדי לחשב עלות Bunny.net פר-משתמש.
--   כל פעם שמשתמש *מתחיל* לצפות בסרטון — נרשמת שורה אחת.
--   זה מאפשר לספור גם צפיות חוזרות (לא רק "צפה/לא צפה" כמו
--   journey_progress.video_watched הבוליאני).
--
--   המחיר עצמו (per-minute / per-GB) מחושב בצד השרת ב-cost-model.ts;
--   הטבלה שומרת רק אומדן שניות לכל צפייה (ברירת מחדל 180 = 3 דקות).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.video_view_events (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- צעד מסע (אופציונלי — null לסרטוני קורס/אחר)
  step_id            UUID,
  -- bunny / youtube / vimeo / heygen / custom
  provider           TEXT,
  -- מזהה הסרטון אצל הספק (Bunny GUID וכו')
  external_id        TEXT,
  -- אומדן משך הצפייה בשניות. ברירת המחדל 180 (3 דק') לפי הגדרת המוצר.
  estimated_seconds  INTEGER NOT NULL DEFAULT 180,
  -- היכן נצפה: journey / course / other — לסינון עתידי
  context            TEXT NOT NULL DEFAULT 'journey',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_video_view_events_user
  ON public.video_view_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_video_view_events_created
  ON public.video_view_events (created_at DESC);

ALTER TABLE public.video_view_events ENABLE ROW LEVEL SECURITY;

-- משתמשים: רואים ומכניסים רק את הצפיות של עצמם.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='video_view_events' AND policyname='users_own_video_views'
  ) THEN
    CREATE POLICY "users_own_video_views" ON public.video_view_events
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- אדמינים: צפייה בכל האירועים (לדאשבורד עלויות).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='video_view_events' AND policyname='admins_view_video_views'
  ) THEN
    CREATE POLICY "admins_view_video_views" ON public.video_view_events
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
      );
  END IF;
END $$;
