-- ============================================================
-- NuraWell — AI Notification Engine
-- Migration: 000027_ai_notification_engine.sql
-- Description:
--   טבלאות נקיות בשביל "מנוע התראות חכם" שמופעל מ-Upstash Workflows
--   ב-3 קרונים יומיים (08:00, 13:00, 20:00) + OpenAI gpt-4o-mini.
--
--   המנוע משתמש ב-Supabase כמקור-אמת:
--     • profiles.daily_task  → שם המשימה היומית האקטיבית של המשתמש (טקסט קצר).
--     • task_logs            → לוג ביצועי משימות יומיות (קל-משקל; אחד ליום + שם משימה).
--     • notification_logs    → לוג כל ההתראות שנוצרו ע"י ה-LLM, גם לדאשבורד אדמין
--                              וגם להצגת היסטוריה למשתמש.
--
--   הטבלאות *לא מחליפות* את journey_task_executions ו-notifications הקיימות;
--   הן מצומצמות בכוונה כדי שתעבוד ל-engine הפשוט שתואר ב-AI_CONTEXT החדש
--   ("Notification State" + escalation).
-- ============================================================

-- ============================================================
-- 1. profiles.daily_task  — המשימה היומית האקטיבית
-- ============================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS daily_task TEXT;

COMMENT ON COLUMN public.profiles.daily_task IS
  'המשימה היומית הנוכחית של המשתמש (טקסט קצר). משמש כ-{{taskName}} בהתראות.';

-- ============================================================
-- 2. task_logs  — לוג ביצוע משימה יומית
-- שורה אחת לכל (user_id, date_key) = המשימה הושלמה באותו יום.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.task_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  task_name    TEXT NOT NULL,
  -- תאריך לוח ירושלים (YYYY-MM-DD) — מאפשר חישוב יומי דטרמיניסטי של "today"
  date_key     TEXT NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source       TEXT NOT NULL DEFAULT 'manual', -- manual | chat | notification_action

  UNIQUE (user_id, date_key)
);

CREATE INDEX IF NOT EXISTS idx_task_logs_user_date
  ON public.task_logs (user_id, date_key DESC);

CREATE INDEX IF NOT EXISTS idx_task_logs_date
  ON public.task_logs (date_key);

ALTER TABLE public.task_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='task_logs' AND policyname='users_own_task_logs'
  ) THEN
    CREATE POLICY "users_own_task_logs" ON public.task_logs
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='task_logs' AND policyname='admins_view_task_logs'
  ) THEN
    CREATE POLICY "admins_view_task_logs" ON public.task_logs
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
      );
  END IF;
END $$;

-- ============================================================
-- 3. notification_logs  — לוג ההתראות שנוצרו ע"י ה-AI
-- כל פעם שה-workflow שולח התראה: שורה אחת.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.notification_logs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- time-of-day של הטריגר: morning / noon / evening
  time_of_day         TEXT NOT NULL CHECK (time_of_day IN ('morning','noon','evening')),
  -- ה-Notification State שחושב ע"י ה-rule-engine
  notification_state  TEXT NOT NULL CHECK (notification_state IN (
    'MORNING_KICKOFF',
    'NOON_CHECK',
    'EVENING_CHECK',
    'DAY_2_MISSED',
    'DAY_3_MISSED',
    'DORMANT'
  )),
  task_name           TEXT NOT NULL,
  -- ההודעה הסופית שה-LLM הפיק (max ~15 מילים, רצוי <140 תווים)
  body                TEXT NOT NULL,
  -- "morning" → 2026-05-29 וכו', לאיתור התראות "של היום"
  date_key            TEXT NOT NULL,
  ai_model            TEXT NOT NULL DEFAULT 'gpt-4o-mini',
  metadata            JSONB NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- מונע שליחה כפולה לאותו (user, slot, date) ברמת DB
  UNIQUE (user_id, date_key, time_of_day)
);

CREATE INDEX IF NOT EXISTS idx_notification_logs_user_date
  ON public.notification_logs (user_id, date_key DESC);

CREATE INDEX IF NOT EXISTS idx_notification_logs_created
  ON public.notification_logs (created_at DESC);

ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='notification_logs' AND policyname='users_view_own_notification_logs'
  ) THEN
    CREATE POLICY "users_view_own_notification_logs" ON public.notification_logs
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='notification_logs' AND policyname='admins_view_notification_logs'
  ) THEN
    CREATE POLICY "admins_view_notification_logs" ON public.notification_logs
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
      );
  END IF;
END $$;

-- service_role עוקף RLS ממילא, אבל מוסיפים מדיניות מפורשת לאדמינים עם role 'admin'
-- כדי לאפשר insert/update מ-ops-actions של אדמין מחובר עם anon key.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='notification_logs' AND policyname='admins_manage_notification_logs'
  ) THEN
    CREATE POLICY "admins_manage_notification_logs" ON public.notification_logs
      FOR ALL USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
      );
  END IF;
END $$;
