-- ============================================================
-- NuraWell — Journey Task Executions (recurring tasks)
-- Migration: 000023_journey_task_executions.sql
-- Description:
--   טבלה ל-tracking של ביצוע משימות מתפזרות לאורך זמן
--   (יומיות / כמה פעמים ביום / שבועיות / לפני ארוחה).
--   מה שמתועד פה הוא ביצוע בפועל לפי תאריך + slot, בנוסף
--   ל-`journey_progress.task_statuses` שמתאר את ה-decision
--   הראשוני (accepted/rejected) שמתחיל לטרגט את המשימה.
--
--   schedule נשמר בתוך ה-JSONB של journey_steps.tasks ולכן אין DDL
--   לטבלת journey_steps. אם schedule חסר → ברירת מחדל one_time
--   (אישור חד-פעמי, כמו עד היום).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.journey_task_executions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  step_id      UUID NOT NULL REFERENCES public.journey_steps(id) ON DELETE CASCADE,
  task_id      TEXT NOT NULL,
  -- תאריך לוח ירושלים (YYYY-MM-DD) — לאיפוס יומי + שאילתות היסטוריה
  date_key     TEXT NOT NULL,
  -- slot ברמת יום: morning | noon | evening | full_day | slot_1..slot_8 | meal_breakfast | meal_lunch | meal_dinner
  slot         TEXT NOT NULL DEFAULT 'full_day',
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source       TEXT NOT NULL DEFAULT 'manual', -- manual | chat | reminder
  note         TEXT,

  UNIQUE(user_id, step_id, task_id, date_key, slot)
);

CREATE INDEX IF NOT EXISTS idx_task_exec_user_date
  ON public.journey_task_executions (user_id, date_key DESC);

CREATE INDEX IF NOT EXISTS idx_task_exec_user_step
  ON public.journey_task_executions (user_id, step_id);

CREATE INDEX IF NOT EXISTS idx_task_exec_user_task_date
  ON public.journey_task_executions (user_id, task_id, date_key DESC);

ALTER TABLE public.journey_task_executions ENABLE ROW LEVEL SECURITY;

-- RLS: כל משתמש שולט בשורות שלו בלבד
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'journey_task_executions'
      AND policyname = 'users_own_task_executions'
  ) THEN
    CREATE POLICY "users_own_task_executions" ON public.journey_task_executions
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- RLS: אדמין יכול לראות הכל (לצרכי דיווח/AI)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'journey_task_executions'
      AND policyname = 'admins_view_task_executions'
  ) THEN
    CREATE POLICY "admins_view_task_executions" ON public.journey_task_executions
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
      );
  END IF;
END $$;

-- Realtime — כך שה-UI יתעדכן בלי polling
ALTER PUBLICATION supabase_realtime ADD TABLE public.journey_task_executions;
