-- קשירת סשן דמו לסשן Supabase Auth — כדי שתפוגה/ביטול/ניתוק באמת ינתקו את האורח.
ALTER TABLE public.demo_access_sessions ADD COLUMN IF NOT EXISTS auth_session_id uuid;

CREATE OR REPLACE FUNCTION public.demo_access_bind_auth_session(p_demo_session uuid, p_auth_session uuid, p_not_after timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp AS $$
BEGIN
  UPDATE public.demo_access_sessions SET auth_session_id = p_auth_session WHERE id = p_demo_session;
  UPDATE auth.sessions SET not_after = p_not_after WHERE id = p_auth_session;
END $$;

-- מוחק את סשני ה-Auth של סשני דמו שאינם פעילים עוד (בוטלו/פגו) — מנתק את האורח בלבד, לא את המשתמש האמיתי.
CREATE OR REPLACE FUNCTION public.demo_access_kill_dead_auth_sessions(p_link uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp AS $$
DECLARE n integer;
BEGIN
  DELETE FROM auth.sessions a USING public.demo_access_sessions s
   WHERE a.id = s.auth_session_id
     AND (p_link IS NULL OR s.link_id = p_link)
     AND (s.revoked_at IS NOT NULL OR s.expires_at <= now());
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION public.demo_access_bind_auth_session(uuid, uuid, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.demo_access_kill_dead_auth_sessions(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.demo_access_bind_auth_session(uuid, uuid, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.demo_access_kill_dead_auth_sessions(uuid) TO service_role;
