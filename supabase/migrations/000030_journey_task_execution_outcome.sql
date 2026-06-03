-- ============================================================
-- NuraWell — Task execution outcome (completed vs attempt_failed)
-- Migration: 000030_journey_task_execution_outcome.sql
-- Description:
--   מוסיף עמודה outcome ל-journey_task_executions כדי שמשתמש יוכל
--   לדווח גם "ניסיתי ונכשלתי" (לא רק "בוצע"). הצבע השונה בהיסטוריה
--   ובמערכת החיזוק מוכוון לפי הערך הזה.
--
--   outcome:
--     - 'completed'      (DEFAULT)  → ביצוע מלא של הסלוט (כמו עד היום).
--     - 'attempt_failed'             → "ניסיתי ונכשלתי" — חשוב לתת לזה
--                                     זיהוי כדי שה-AI יגיב בתמיכה ולא
--                                     בחגיגה, וכדי שההיסטוריה תצביע שונה.
--
--   הערה: streak computation סופר רק completed (אם רוצים לבדל בעתיד —
--   קל יהיה מ-DB שיש לו את האמת המלאה).
-- ============================================================

ALTER TABLE public.journey_task_executions
  ADD COLUMN IF NOT EXISTS outcome TEXT NOT NULL DEFAULT 'completed'
  CHECK (outcome IN ('completed', 'attempt_failed'));

CREATE INDEX IF NOT EXISTS idx_task_exec_user_outcome
  ON public.journey_task_executions (user_id, date_key DESC, outcome);

-- אין שינוי ב-RLS — הפוליסי הקיים כבר מבוסס user_id.
