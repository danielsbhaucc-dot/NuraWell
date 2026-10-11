-- קישורי גישת דמו: צפייה במערכת עם נתוני משתמש מוגדר מראש, בלי הרשאות מנהל.
-- האסימון הגולמי נשמר רק אצל יוצר הקישור; במסד — hash בלבד.

CREATE TABLE IF NOT EXISTS public.demo_access_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  target_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  guest_name text,
  reason text NOT NULL,
  password_hash text,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_by uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  first_claimed_at timestamptz,
  last_claimed_at timestamptz,
  claim_count integer NOT NULL DEFAULT 0 CHECK (claim_count >= 0),
  max_claims integer CHECK (max_claims IS NULL OR max_claims > 0),
  session_epoch integer NOT NULL DEFAULT 1 CHECK (session_epoch > 0),
  welcome_image_key text,
  CONSTRAINT demo_access_links_reason_len CHECK (char_length(btrim(reason)) BETWEEN 2 AND 280),
  CONSTRAINT demo_access_links_guest_name_len CHECK (
    guest_name IS NULL OR char_length(btrim(guest_name)) BETWEEN 1 AND 80
  )
);

CREATE INDEX IF NOT EXISTS idx_demo_access_links_expires_at
  ON public.demo_access_links (expires_at);
CREATE INDEX IF NOT EXISTS idx_demo_access_links_target
  ON public.demo_access_links (target_user_id);
CREATE INDEX IF NOT EXISTS idx_demo_access_links_created_by
  ON public.demo_access_links (created_by);

COMMENT ON TABLE public.demo_access_links IS
  'קישורי גישת דמו זמניים — service_role בלבד; token_hash = sha256 של האסימון.';

-- סשנים פעילים: כשקיים סשן פתוח, is_admin()/nura_is_admin() מחזירים false ל-target.
CREATE TABLE IF NOT EXISTS public.demo_access_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id uuid NOT NULL REFERENCES public.demo_access_links (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  session_epoch integer NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_demo_access_sessions_active
  ON public.demo_access_sessions (user_id, expires_at)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_demo_access_sessions_link
  ON public.demo_access_sessions (link_id);

COMMENT ON TABLE public.demo_access_sessions IS
  'סשני דמו פעילים — חוסמים הרשאות admin ב-RLS כל עוד הסשן בתוקף.';

REVOKE ALL ON public.demo_access_links FROM PUBLIC;
REVOKE ALL ON public.demo_access_sessions FROM PUBLIC;
GRANT ALL ON public.demo_access_links TO service_role;
GRANT ALL ON public.demo_access_sessions TO service_role;

ALTER TABLE public.demo_access_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.demo_access_sessions ENABLE ROW LEVEL SECURITY;

-- אין מדיניות ל-anon/authenticated — גישה רק דרך service_role.

CREATE OR REPLACE FUNCTION public.demo_access_blocks_admin(uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.demo_access_sessions s
    WHERE s.user_id = uid
      AND s.revoked_at IS NULL
      AND s.expires_at > now()
  );
$$;

REVOKE ALL ON FUNCTION public.demo_access_blocks_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.demo_access_blocks_admin(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.demo_access_blocks_admin(uuid) IS
  'true אם למשתמש יש סשן דמו פעיל — אז אין להעניק הרשאות מנהל ב-RLS.';

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
          AND role = 'admin'
          AND NOT public.demo_access_blocks_admin(auth.uid())
    );
$$;

CREATE OR REPLACE FUNCTION public.nura_is_admin(uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = uid
      AND lower(btrim(p.role::text)) IN (
        'admin', 'administrator', 'super_admin', 'superadmin', 'owner', 'ops'
      )
      AND NOT public.demo_access_blocks_admin(uid)
  );
$$;
