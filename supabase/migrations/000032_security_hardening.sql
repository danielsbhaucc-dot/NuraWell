-- ============================================================
-- NuraWell — Security Hardening
-- Migration: 000032_security_hardening.sql
--
-- Description:
--   הקשחת אבטחה כוללת על בסיס סקירת ה-RLS וה-RPC. שלושה צירים:
--
--     1) profiles.role / profiles.is_active — מונעים escalation עצמית.
--        נצמדים לשתי שכבות: REVOKE על UPDATE column-level (PostgREST
--        אוכף לפני RLS) + BEFORE UPDATE trigger כ-defense in depth כדי
--        שגם service-role-misuse או patch ידני יחסם אם מנסים לשנות
--        role/is_active לא דרך admin.
--
--     2) SECURITY DEFINER RPC functions —
--        `increment_notification_count`, `touch_last_responded_at`,
--        `almog_kickoff_state_counts`. כולן מוענקות היום ל-`authenticated`,
--        מה שמאפשר user מחובר להפעיל אותן על UUID של משתמש אחר ולעקוף
--        RLS. כל הקריאות בקוד עוברות דרך admin client (service_role)
--        לכן אפשר לבטל בבטחה מ-`authenticated`. מוסיפים בנוסף בדיקה
--        בתוך הפונקציה: אם זה לא service_role, חייב p_user_id = auth.uid().
--
--     3) journey_steps — ה-policy הקיימת מאפשרת קריאה לכל אחד (כולל
--        `anon`) של תוכן `is_published = TRUE`. מצמצמים ל-`authenticated`
--        בלבד כדי שתוכן שיעורים, quiz, PDFs ו-task lists לא יהיו
--        חשופים פומבית.
--
--  הערה: כל המבנה idempotent (DROP IF EXISTS / CREATE OR REPLACE).
-- ============================================================

-- ============================================================
-- 1. profiles — locking down role/is_active
-- ============================================================

-- 1.a column-level REVOKE — שכבה ראשונה
REVOKE UPDATE (role, is_active) ON public.profiles FROM authenticated;
REVOKE UPDATE (role, is_active) ON public.profiles FROM anon;

-- 1.b trigger — defense in depth
CREATE OR REPLACE FUNCTION public.profiles_block_role_self_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- עוקפים בכלל אם אין session (cron / migrations / scripts → service_role).
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- שינוי role/is_active מותר רק ל-admin (שמשתמש ב-PostgREST אבל role/is_active דרך REVOKE
  -- ייכשל קודם; ה-trigger הוא רשת ביטחון נוספת לכל מי שמגיע ל-UPDATE עוקף שדות).
  IF (NEW.role IS DISTINCT FROM OLD.role)
     OR (NEW.is_active IS DISTINCT FROM OLD.is_active) THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'profiles.role/is_active can only be modified by an administrator';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_block_role_self_update ON public.profiles;
CREATE TRIGGER profiles_block_role_self_update
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_block_role_self_update();

COMMENT ON FUNCTION public.profiles_block_role_self_update() IS
  'מונע ממשתמשים מחוברים לשנות profiles.role / profiles.is_active. רק admin יכול. service_role (auth.uid() IS NULL) עוקף.';

-- ============================================================
-- 2. SECURITY DEFINER RPCs — closing per-user write functions
-- ============================================================

-- 2.a increment_notification_count — הוסף בדיקת ownership פנימית
CREATE OR REPLACE FUNCTION public.increment_notification_count(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_count INTEGER;
BEGIN
  -- אם הקריאה לא service_role (יש auth.uid()), חייב להיות ה-user של עצמו.
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'cannot increment notification count for another user';
  END IF;

  UPDATE public.profiles
     SET notification_count = COALESCE(notification_count, 0) + 1
   WHERE id = p_user_id
  RETURNING notification_count INTO v_new_count;

  RETURN COALESCE(v_new_count, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.increment_notification_count(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_notification_count(UUID) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_notification_count(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.increment_notification_count(UUID) TO service_role;

-- 2.b touch_last_responded_at — הוסף בדיקת ownership פנימית
CREATE OR REPLACE FUNCTION public.touch_last_responded_at(p_user_id UUID)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'cannot touch last_responded_at for another user';
  END IF;

  UPDATE public.profiles
     SET last_responded_at = v_now
   WHERE id = p_user_id;
  RETURN v_now;
END;
$$;

REVOKE ALL ON FUNCTION public.touch_last_responded_at(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.touch_last_responded_at(UUID) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_last_responded_at(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.touch_last_responded_at(UUID) TO service_role;

-- 2.c almog_kickoff_state_counts — telemetry גלובלית, רק service_role
REVOKE EXECUTE ON FUNCTION public.almog_kickoff_state_counts() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.almog_kickoff_state_counts() FROM anon;
REVOKE EXECUTE ON FUNCTION public.almog_kickoff_state_counts() FROM PUBLIC;
-- ה-route /api/v1/admin/kickoff-status קורא דרך admin client (service_role), אז זה נמשיך לעבוד.

-- ============================================================
-- 3. journey_steps — limit reads to authenticated users
-- ============================================================
DROP POLICY IF EXISTS "anyone_view_published_steps" ON public.journey_steps;

CREATE POLICY "authenticated_view_published_steps" ON public.journey_steps
  FOR SELECT
  TO authenticated
  USING (
    is_published = TRUE
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

COMMENT ON POLICY "authenticated_view_published_steps" ON public.journey_steps IS
  'תוכן published של journey_steps נחשף רק למשתמשים מחוברים. anonymous לא יכול לקרוא חומרי קורס, PDF urls, quiz וכו'' עד שיתחבר.';
