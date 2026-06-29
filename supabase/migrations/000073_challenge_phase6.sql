-- ============================================================
-- NuraWell — Challenge phase 6: admin audit log
-- Migration: 000073_challenge_phase6.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS public.challenge_admin_audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action        TEXT NOT NULL,
  entity_type   TEXT NOT NULL,
  entity_id     TEXT,
  summary       TEXT NOT NULL,
  payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_challenge_audit_created
  ON public.challenge_admin_audit_log (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_challenge_audit_entity
  ON public.challenge_admin_audit_log (entity_type, created_at DESC);

COMMENT ON TABLE public.challenge_admin_audit_log IS
  'OPS audit trail for challenge admin changes';

ALTER TABLE public.challenge_admin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "challenge_audit_admin_select"
  ON public.challenge_admin_audit_log FOR SELECT TO authenticated
  USING (public.nura_is_admin());

CREATE POLICY "challenge_audit_admin_insert"
  ON public.challenge_admin_audit_log FOR INSERT TO authenticated
  WITH CHECK (public.nura_is_admin() AND admin_user_id = auth.uid());
