-- גישה לטיקטים דרך RPC + SECURITY DEFINER — עוקף בעיות GRANT/PostgREST על הטבלה; עדיין דורש JWT service_role תקין לאותו פרויקט
CREATE OR REPLACE FUNCTION public.insert_ops_auth_ticket(
  p_access_token text,
  p_refresh_token text,
  p_expires_at timestamptz
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id uuid;
BEGIN
  INSERT INTO public.ops_auth_tickets (access_token, refresh_token, expires_at)
  VALUES (p_access_token, p_refresh_token, p_expires_at)
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_ops_auth_ticket(p_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  DELETE FROM public.ops_auth_tickets t
  WHERE t.id = p_id AND t.expires_at > now()
  RETURNING t.access_token, t.refresh_token, t.expires_at INTO r;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  RETURN json_build_object(
    'access_token', r.access_token,
    'refresh_token', r.refresh_token,
    'expires_at', r.expires_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.insert_ops_auth_ticket(text, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_ops_auth_ticket(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.insert_ops_auth_ticket(text, text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_ops_auth_ticket(uuid) TO service_role;
