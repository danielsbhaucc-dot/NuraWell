-- ============================================================
-- NuraWell — Almog Kickoff Status (watchdog for first-touch)
-- Migration: 000025_almog_kickoff_status.sql
--
-- ההתראה הראשונה של אלמוג למשתמש חדש שכשלה לא פעם:
--  - אם QSTASH_TOKEN חסר → schedule נכשל בשקט
--  - אם המייל לא אומת → post-verify אף פעם לא רץ
--  - cron master מסנן לפי last_active_at שלא קיים למשתמש חדש
--
-- הטבלה הזו היא ה-ground-truth שמאפשרת ל-cron יומי לתפוס כל מקרה כושל:
--  - כל ניסיון תזמון נכתב כאן (גם אם QStash נפל)
--  - cron יומי סורק שורות עם state='pending' / 'failed' ושולח directly
--  - admin יכול לראות מי תקוע ולמה
-- ============================================================

CREATE TABLE IF NOT EXISTS public.almog_kickoff_status (
  user_id           UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  state             TEXT NOT NULL DEFAULT 'pending'
                    CHECK (state IN ('pending','scheduled','sent','failed','skipped')),
  scheduled_at      TIMESTAMPTZ,
  last_attempt_at   TIMESTAMPTZ,
  sent_at           TIMESTAMPTZ,
  attempts          INTEGER NOT NULL DEFAULT 0,
  last_error        TEXT,
  -- הסיבה לדילוג (avoid_push / onboarding_incomplete / journey_complete)
  skip_reason       TEXT,
  workflow_run_id   TEXT,
  source            TEXT NOT NULL DEFAULT 'post_verify',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_almog_kickoff_status_state_pending
  ON public.almog_kickoff_status (state, last_attempt_at)
  WHERE state IN ('pending','failed');

CREATE INDEX IF NOT EXISTS idx_almog_kickoff_status_sent
  ON public.almog_kickoff_status (state, sent_at DESC);

ALTER TABLE public.almog_kickoff_status ENABLE ROW LEVEL SECURITY;

-- אדמינים יכולים לקרוא הכל
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'almog_kickoff_status'
      AND policyname = 'admins_view_kickoff_status'
  ) THEN
    CREATE POLICY "admins_view_kickoff_status" ON public.almog_kickoff_status
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
      );
  END IF;
END $$;

-- המשתמש עצמו יכול לראות את השורה שלו (לדבאג ב-client)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'almog_kickoff_status'
      AND policyname = 'users_view_own_kickoff_status'
  ) THEN
    CREATE POLICY "users_view_own_kickoff_status" ON public.almog_kickoff_status
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

-- trigger ל-updated_at אוטומטי
CREATE OR REPLACE FUNCTION public._almog_kickoff_status_touch()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_almog_kickoff_status_touch ON public.almog_kickoff_status;
CREATE TRIGGER trg_almog_kickoff_status_touch
  BEFORE UPDATE ON public.almog_kickoff_status
  FOR EACH ROW EXECUTE FUNCTION public._almog_kickoff_status_touch();

-- RPC לסטטיסטיקה מהירה ב-admin dashboard
CREATE OR REPLACE FUNCTION public.almog_kickoff_state_counts()
RETURNS TABLE (
  total INTEGER,
  pending INTEGER,
  scheduled INTEGER,
  sent INTEGER,
  failed INTEGER,
  skipped INTEGER,
  orphans INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*)::INTEGER FROM public.almog_kickoff_status),
    (SELECT COUNT(*)::INTEGER FROM public.almog_kickoff_status WHERE state = 'pending'),
    (SELECT COUNT(*)::INTEGER FROM public.almog_kickoff_status WHERE state = 'scheduled'),
    (SELECT COUNT(*)::INTEGER FROM public.almog_kickoff_status WHERE state = 'sent'),
    (SELECT COUNT(*)::INTEGER FROM public.almog_kickoff_status WHERE state = 'failed'),
    (SELECT COUNT(*)::INTEGER FROM public.almog_kickoff_status WHERE state = 'skipped'),
    -- משתמשים עם onboarding_completed=true ובלי שורה בטבלה (= מקרים שלא נתפסו)
    (
      SELECT COUNT(*)::INTEGER
      FROM public.profiles p
      LEFT JOIN public.almog_kickoff_status s ON s.user_id = p.id
      WHERE p.onboarding_completed = TRUE AND s.user_id IS NULL
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.almog_kickoff_state_counts() TO authenticated;
