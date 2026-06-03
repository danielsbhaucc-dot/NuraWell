-- ============================================================
-- NuraWell — Response outcomes expansion (partial, skipped)
-- Migration: 000031_response_outcomes_expansion.sql
-- Description:
--   המיגרציה הזו מרחיבה את הערכים המותרים בעמודה `outcome` של
--   `journey_task_executions` כך שתתמוך בסיווג עשיר יותר של תגובות משתמש:
--
--     completed       → ביצוע מלא (כמו עד היום, ברירת מחדל).
--     attempt_failed  → ניסה ולא הצליח / שכח (מיגרציה 000030).
--     partial         → ביצוע חלקי ("שתיתי קצת", "1 מתוך 3") — חדש.
--     skipped         → דילוג מודע ליום אחד ("לא היום", "מוותר היום") — חדש.
--
--   ההרחבה דרושה כדי שהקלסיפיקטור החדש (`lib/ai/response-classifier.ts`)
--   יוכל לכתוב את הסטטוס המדויק של הסלוט, ולא לאבד מידע ע"י קיפול ל-`completed`
--   או ל-attempt_failed (מה שהיה ב-flow הקודם, regex done/miss/none בלבד).
--
--   `opted_out` *לא* נכתב פה — היא תכונה ברמת ההרגל ולא ברמת הסלוט היומי.
--   היא מסומנת ב-`journey_progress.habit_meta[habitId].opted_out = true`,
--   ומכובדת ע"י cron + UI כדי לא להמשיך לבקש את ההרגל הזה. אין צורך
--   ב-DDL לזה כי `habit_meta` הוא JSONB גמיש (מיגרציה 000024).
-- ============================================================

-- 1. הסרת ה-CHECK הישן (אם קיים) והוספה של אחד מורחב.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'journey_task_executions_outcome_check'
  ) THEN
    ALTER TABLE public.journey_task_executions
      DROP CONSTRAINT journey_task_executions_outcome_check;
  END IF;
END $$;

-- 2. הוספת CHECK חדש עם 4 הערכים הנתמכים.
ALTER TABLE public.journey_task_executions
  ADD CONSTRAINT journey_task_executions_outcome_check
  CHECK (outcome IN ('completed', 'attempt_failed', 'partial', 'skipped'));

-- 3. לעדכן את comment כדי שיהיה ברור בעת קריאת ה-DB:
COMMENT ON COLUMN public.journey_task_executions.outcome IS
  'Slot outcome: completed (full done) | partial (some) | attempt_failed (tried & missed) | skipped (one-day opt-out)';

-- ה-index הקיים `idx_task_exec_user_outcome` עדיין מצוין מספיק כי הוא BTREE
-- על (user_id, date_key DESC, outcome) — כל ארבעת הערכים מקבלים cardinality
-- סבירה. אין צורך לגעת בו.
