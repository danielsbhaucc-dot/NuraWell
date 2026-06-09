-- ============================================================
-- NuraWell — journey_progress.last_engaged_at (אות פעילות-משתמש אמיתי)
-- Migration: 000047_journey_progress_last_engaged_at.sql
--
-- רקע / באג שתוקן:
--   מנוע ה-dormancy (fetchTrueLastActiveByUser) קובע "מתי המשתמש היה פעיל
--   לאחרונה" כדי לבחור cadence תזכורות. כשהשתמשנו ב-journey_progress.updated_at
--   כאות, התגלה שהוא *מזוהם*: יש trigger
--     update_journey_progress_updated_at BEFORE UPDATE → NEW.updated_at = NOW()
--   שמרים את updated_at בכל UPDATE, כולל ה-cron הרקעי `habit-target-tune`
--   שמעדכן habit_meta אוטומטית. כך משתמש דורמנטי שקיבל התאמת-יעד אוטומטית
--   היה "מתאפס" ל-active בטעות.
--
-- הפתרון:
--   עמודה ייעודית `last_engaged_at` שרק *פעולות משתמש אמיתיות* כותבות אליה
--   במפורש (קבלת/דחיית משימה, סימון הרגל, צפייה/חידון/התחייבות, פידבק רמה).
--   ה-trigger לא נוגע בעמודה הזו, ו-`habit-target-tune` *לא* כותב אליה →
--   אות נקי לחלוטין. ה-dormancy engine קורא ממנה במקום מ-updated_at.
--
-- Backfill: ערך התחלתי = updated_at הקיים (best-effort; משם והלאה רק
--   פעולות משתמש אמיתיות יעדכנו). זה יכול רק "להאריך" פעילות לתקופה
--   הראשונה — כיוון בטוח (עדיף לתזכר מאשר לא).
-- ============================================================

ALTER TABLE public.journey_progress
  ADD COLUMN IF NOT EXISTS last_engaged_at TIMESTAMPTZ;

UPDATE public.journey_progress
  SET last_engaged_at = updated_at
  WHERE last_engaged_at IS NULL;

-- אינדקס לשאילתת ה-dormancy (in(user_id) + gte(last_engaged_at)).
CREATE INDEX IF NOT EXISTS idx_journey_progress_last_engaged
  ON public.journey_progress (user_id, last_engaged_at DESC);

COMMENT ON COLUMN public.journey_progress.last_engaged_at IS 'חותמת זמן של פעולת-משתמש אמיתית אחרונה (קבלת/דחיית משימה, סימון הרגל, צפייה/חידון/התחייבות, פידבק רמה). נכתבת במפורש על-ידי נתיבי משתמש בלבד; תהליכי רקע (habit-target-tune) לא מעדכנים אותה. מקור האמת ל-dormancy.';
