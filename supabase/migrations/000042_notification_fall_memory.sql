-- ============================================================
-- NuraWell — זיכרון נפילות (fall episodes) להתראות אלמוג
-- Migration: 000042_notification_fall_memory.sql
--
-- Description:
--   שומר היסטוריה של "נפילות" — תקופות שבהן המשתמש לא הגיב.
--   משמש את LLM לזהות דפוסים חוזרים ("שוב נעלמת לי?") ולשמור
--   סיבות ידועות (צ'אט, משימה, unknown).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.notification_fall_episodes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open', 'recovered')),
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at        TIMESTAMPTZ,
  first_seen_date DATE NOT NULL,
  last_seen_date  DATE NOT NULL,
  max_days_absent INTEGER NOT NULL DEFAULT 1 CHECK (max_days_absent >= 1),
  last_activity_at TIMESTAMPTZ,
  reason_summary  TEXT,
  reason_source   TEXT CHECK (reason_source IN (
                    'chat', 'task_note', 'profile_context', 'unknown'
                  )),
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.notification_fall_episodes IS
  'אפיזודות נפילה — תקופות היעדרות של משתמש מהצ''אט/משימות. משמש LLM להתאמת טון וזיכרון דפוסים.';

CREATE INDEX IF NOT EXISTS idx_notification_fall_episodes_user_status
  ON public.notification_fall_episodes (user_id, status, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_fall_episodes_user_recovered
  ON public.notification_fall_episodes (user_id, ended_at DESC)
  WHERE status = 'recovered';

-- episode פתוח אחד לכל משתמש
CREATE UNIQUE INDEX IF NOT EXISTS uq_notification_fall_episodes_open_user
  ON public.notification_fall_episodes (user_id)
  WHERE status = 'open';

ALTER TABLE public.notification_fall_episodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY notification_fall_episodes_select_own
  ON public.notification_fall_episodes
  FOR SELECT
  USING (auth.uid() = user_id);

-- service role / admin writes only (cron + workflow)
CREATE POLICY notification_fall_episodes_service_all
  ON public.notification_fall_episodes
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION public.touch_notification_fall_episode_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notification_fall_episodes_updated_at
  ON public.notification_fall_episodes;

CREATE TRIGGER trg_notification_fall_episodes_updated_at
  BEFORE UPDATE ON public.notification_fall_episodes
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_notification_fall_episode_updated_at();
