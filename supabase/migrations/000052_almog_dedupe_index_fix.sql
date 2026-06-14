-- ============================================================
-- NuraWell — Almog dedupe index fix (תזכורות/משימות/חסמים לא נשמרו)
-- Migration: 000052_almog_dedupe_index_fix.sql
--
-- באג: כל ה-upserts של התחייבויות אלמוג (תזכורות, משימות, חסמים) השתמשו ב-
-- `ON CONFLICT (user_id, dedupe_key)` (דרך supabase-js `onConflict`), אבל
-- האינדקסים הייחודיים שנוצרו ב-000048 היו *חלקיים* (`WHERE dedupe_key IS NOT
-- NULL`). PostgreSQL לא יסיק אינדקס ייחודי חלקי עבור ON CONFLICT אלא אם מצוין
-- גם ה-predicate — ו-PostgREST/supabase-js לא שולח אותו. התוצאה: כל upsert
-- נכשל בשקט עם "there is no unique or exclusion constraint matching the ON
-- CONFLICT specification", שום תזכורת לא נשמרה, ואלמוג "הבטיח להזכיר" בלי שדבר
-- נרשם או נמסר.
--
-- התיקון: ממירים את שלושת האינדקסים לאינדקסים ייחודיים *מלאים* (בלי predicate).
-- הסמנטיקה נשמרת: NULLs נחשבים שונים זה מזה (NULLS DISTINCT — ברירת מחדל), כך
-- שעדיין מותר ריבוי רשומות עם dedupe_key=NULL, אבל ערכי dedupe_key לא-NULL
-- ממשיכים להיות ייחודיים לכל משתמש — וההיסק של ON CONFLICT עובד.
-- ============================================================

-- 1) almog_assignments
DROP INDEX IF EXISTS public.uq_almog_assignments_dedupe;
CREATE UNIQUE INDEX IF NOT EXISTS uq_almog_assignments_dedupe
  ON public.almog_assignments (user_id, dedupe_key);

-- 2) scheduled_reminders
DROP INDEX IF EXISTS public.uq_scheduled_reminders_dedupe;
CREATE UNIQUE INDEX IF NOT EXISTS uq_scheduled_reminders_dedupe
  ON public.scheduled_reminders (user_id, dedupe_key);

-- 3) almog_blockers
DROP INDEX IF EXISTS public.uq_almog_blockers_dedupe;
CREATE UNIQUE INDEX IF NOT EXISTS uq_almog_blockers_dedupe
  ON public.almog_blockers (user_id, dedupe_key);
