-- ============================================================
-- NuraWell — Chat transcript admin security (multi-layer)
-- Migration: 000079_chat_transcript_security.sql
-- ============================================================

-- הרחבת סוגי הסכמה: גישת צוות לתמלילי שיחה (באישור משתמש)
ALTER TABLE public.user_consents DROP CONSTRAINT IF EXISTS user_consents_type_check;
ALTER TABLE public.user_consents ADD CONSTRAINT user_consents_type_check CHECK (
  consent_type IN (
    'terms',
    'privacy',
    'health_data',
    'parental_guardian',
    'age_declaration',
    'marketing',
    'push_notifications',
    'guardian_opt_in',
    'admin_transcript_access'
  )
);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS admin_transcript_access_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.admin_transcript_access_at IS
  'מועד אישור משתמש לגישת צוות לתמלילי שיחות (ניתן לבטל בהגדרות פרטיות).';

-- בקשות גישה לתמליל (פר-שיחה או כללית)
CREATE TABLE IF NOT EXISTS public.chat_transcript_access_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_id      UUID REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
  admin_user_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'denied', 'expired')),
  reason          TEXT NOT NULL,
  admin_note      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at     TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '72 hours'),
  access_until    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_chat_transcript_access_user_status
  ON public.chat_transcript_access_requests (user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_transcript_access_session
  ON public.chat_transcript_access_requests (session_id, status)
  WHERE session_id IS NOT NULL;

COMMENT ON TABLE public.chat_transcript_access_requests IS
  'בקשות אדמין לצפייה בתמליל — דורש אישור משתמש (או הסכמה גלובלית בפרופיל).';

ALTER TABLE public.chat_transcript_access_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_view_own_transcript_access_requests"
  ON public.chat_transcript_access_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "users_update_own_transcript_access_requests"
  ON public.chat_transcript_access_requests FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "admins_view_transcript_access_requests"
  ON public.chat_transcript_access_requests FOR SELECT TO authenticated
  USING (public.nura_is_admin());

-- Audit log לכל פעולת אדמין על תמלילים
CREATE TABLE IF NOT EXISTS public.chat_transcript_admin_audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_user_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_id      UUID,
  action          TEXT NOT NULL,
  reason          TEXT,
  summary         TEXT NOT NULL,
  payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_transcript_audit_created
  ON public.chat_transcript_admin_audit_log (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_transcript_audit_target
  ON public.chat_transcript_admin_audit_log (target_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_transcript_audit_admin
  ON public.chat_transcript_admin_audit_log (admin_user_id, created_at DESC);

COMMENT ON TABLE public.chat_transcript_admin_audit_log IS
  'OPS audit trail — צפייה/ייצוא/שיתוף/שליחה של תמלילי שיחה.';

ALTER TABLE public.chat_transcript_admin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chat_transcript_audit_admin_select"
  ON public.chat_transcript_admin_audit_log FOR SELECT TO authenticated
  USING (public.nura_is_admin());

CREATE POLICY "chat_transcript_audit_admin_insert"
  ON public.chat_transcript_admin_audit_log FOR INSERT TO authenticated
  WITH CHECK (public.nura_is_admin() AND admin_user_id = auth.uid());
