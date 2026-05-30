-- ============================================================
-- NuraWell — Notification Engine: response tracking
-- Migration: 000029_notification_response_tracking.sql
--
-- Description:
--   מאחד שתי הנחיות AI חיצוניות (Claude) לתוך מנוע ההתראות הקיים:
--
--     • הנחיה 1: "מערכת ליווי AI חכמה עם התראות אנושיות" — דרשה
--       מעקב אחרי `last_responded_at`, `last_notified_at` ו-counter
--       של כמה התראות נשלחו, וגם דילוג חכם אם המשתמש הגיב לאחרונה.
--     • הנחיה 2: אופטימיזציית prompt (lean) ו-`max_tokens` נמוך —
--       *לא* דורשת שינוי DB, רק קוד.
--
--   הפרויקט *כבר* כולל את ארכיטקטורת ה-engine (`notification_logs`,
--   `task_logs`, `profiles.daily_task`, state-machine) ב-migration 000027.
--   לכן הקובץ הזה לא יוצר טבלאות חדשות — רק *מעשיר את `profiles`* בשני
--   שדות חסרים כדי להעביר את ה-engine ל-context-aware מלא.
--
--   • `profiles.last_responded_at` — מתי המשתמש אחרון כתב בצ'אט / סימן
--     משימה. ה-engine יקרא אותו כדי לדלג על slot אם המשתמש פעיל
--     בשעות האחרונות (avoidance של "הצפת" משתמש מעורב).
--   • `profiles.notification_count` — סך כל ההתראות שאי-פעם נשלחו לו
--     ע"י ה-AI engine. משמש כקלט הקשרי ל-LLM (משתמש שקיבל הרבה
--     התראות → טון אחר). יתעדכן ב-`logNotification`.
--
--   חשוב: `last_notified_at` *לא* מוסיפים כאן — אפשר לגזור אותו
--   דטרמיניסטית מ-`notification_logs` (last row by user_id), בלי
--   denormalization נוסף. כך נמנעים מ-drift בין שתי המקורות.
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_responded_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notification_count INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.profiles.last_responded_at IS
  'מתי המשתמש כתב הודעה בצ''אט אלמוג / סימן משימה לאחרונה. משמש לדילוג חכם של ה-notification engine: אם המשתמש פעיל ב-6 השעות האחרונות, מדלגים על slot ההתראה הנוכחי כדי לא להציף אותו.';

COMMENT ON COLUMN public.profiles.notification_count IS
  'סך התראות AI שנשלחו אי-פעם למשתמש. מעודכן ע"י logNotification אחרי כל הצלחה. נכנס לקונטקסט שעובר ל-LLM כדי שיתאים את הטון (משתמש "ותיק" עם הרבה התראות → טון אחר).';

-- אינדקס לזיהוי מהיר של "משתמשים פעילים בשעה האחרונה" — מועיל
-- כשה-engine רץ ב-batch (cron) כדי לסנן ב-DB ולא ב-memory.
CREATE INDEX IF NOT EXISTS idx_profiles_last_responded_at
  ON public.profiles (last_responded_at DESC)
  WHERE last_responded_at IS NOT NULL;

-- ============================================================
-- RPC: increment_notification_count(p_user_id)
--   Atomic increment ל-`notification_count`. נקרא ע"י `logNotification`
--   אחרי כל הצלחה. race-safe (UPDATE עם expression בלי לקרוא קודם).
-- ============================================================
CREATE OR REPLACE FUNCTION public.increment_notification_count(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_count INTEGER;
BEGIN
  UPDATE public.profiles
     SET notification_count = COALESCE(notification_count, 0) + 1
   WHERE id = p_user_id
  RETURNING notification_count INTO v_new_count;

  RETURN COALESCE(v_new_count, 0);
END;
$$;

COMMENT ON FUNCTION public.increment_notification_count IS
  'Atomic ++notification_count פר משתמש. נקרא ע"י notification engine אחרי insert ב-notification_logs.';

GRANT EXECUTE ON FUNCTION public.increment_notification_count(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_notification_count(UUID) TO authenticated;

-- ============================================================
-- RPC: touch_last_responded_at(p_user_id)
--   מעדכן את `profiles.last_responded_at = NOW()` בקריאה אטומית בודדת.
--   נקרא מה-chat route אחרי שמשתמש שולח הודעה. fire-and-forget
--   מהקליינט — אם הוא נכשל, ה-engine פשוט יראה ערך ישן יותר ב-slot הבא.
-- ============================================================
CREATE OR REPLACE FUNCTION public.touch_last_responded_at(p_user_id UUID)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
BEGIN
  UPDATE public.profiles
     SET last_responded_at = v_now
   WHERE id = p_user_id;
  RETURN v_now;
END;
$$;

COMMENT ON FUNCTION public.touch_last_responded_at IS
  'מסמן שהמשתמש פעיל עכשיו (כתב בצ''אט / סימן משימה). משמש את notification engine לדילוג חכם של slot אם המשתמש פעיל ב-6 השעות האחרונות.';

GRANT EXECUTE ON FUNCTION public.touch_last_responded_at(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.touch_last_responded_at(UUID) TO authenticated;
