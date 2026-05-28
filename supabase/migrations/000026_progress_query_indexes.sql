-- ============================================================
-- NuraWell — Progress query indexes
-- Migration: 000026_progress_query_indexes.sql
-- Description:
--   אינדקסים לשאילתות "תמונת התקדמות מלאה" של משתמש —
--   נקראות גם ע"י האדמין (Ops) וגם ע"י ה-AI chat לצורך הזרקת
--   קונטקסט. בלי האינדקסים האלה השאילתות גוברות באופן ליניארי
--   ככל שמצטברים נתונים.
--
--   1. idx_journey_progress_user_updated — שליפת התקדמות
--      ממוינת לפי updated_at לכל משתמש (Ops / AI).
--   2. idx_task_exec_user_date_step — סינון executions לפי
--      טווח תאריכים כולל step_id (היסטוריה ב-AI prompt).
-- ============================================================

-- 1) התקדמות משתמש ממוינת לפי עדכון אחרון.
--    שימוש: AdminUserJourneyDetail, AI getActiveJourneyContext.
CREATE INDEX IF NOT EXISTS idx_journey_progress_user_updated
  ON public.journey_progress (user_id, updated_at DESC);

-- 2) שליפת executions בטווח תאריכים מסונן לפי משתמש+צעד.
--    שימוש: דו"ח התקדמות מלא ל-AI, מסך /progress.
--    האינדקס הקיים idx_task_exec_user_date מספיק לטווח, אבל
--    מוסיף step_id לתמיכה ב-aggregate per-step.
CREATE INDEX IF NOT EXISTS idx_task_exec_user_step_date
  ON public.journey_task_executions (user_id, step_id, date_key DESC);
