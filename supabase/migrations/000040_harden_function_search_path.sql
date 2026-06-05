-- ============================================================
-- NuraWell — Harden function search_path
-- Migration: 000040_harden_function_search_path.sql
--
-- Description:
--   פונקציות SECURITY DEFINER ללא `SET search_path` חשופות ל-search_path
--   hijacking: תוקף שמסוגל ליצור אובייקט באותו שם בסכמה אחרת (למשל בסכמה
--   זמנית שקודמת ב-search_path) יכול לגרום לפונקציה להריץ קוד לא צפוי
--   בהרשאות הבעלים. שלוש הפונקציות מ-000001 נוצרו ללא `SET search_path`:
--     - public.is_admin()
--     - public.handle_new_user()
--     - public.update_updated_at_column()
--
--   כאן אנו מקבעים את search_path ל-`public` (ול-`pg_temp` בסוף, כמומלץ),
--   בלי לשנות את הלוגיקה. idempotent דרך CREATE OR REPLACE.
-- ============================================================

-- 1. is_admin — בדיקת admin ללא רקורסיית RLS
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    );
$$;

-- 2. handle_new_user — יוצר profile בהרשמה
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, role)
    VALUES (
        NEW.id,
        NEW.raw_user_meta_data->>'full_name',
        'user'
    );
    RETURN NEW;
END;
$$;

-- 3. update_updated_at_column — trigger לעדכון updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.is_admin() IS
  'בדיקת admin (SECURITY DEFINER, search_path מקובע ל-public,pg_temp).';
COMMENT ON FUNCTION public.handle_new_user() IS
  'יצירת profile בהרשמה (SECURITY DEFINER, search_path מקובע ל-public,pg_temp).';
