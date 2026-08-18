-- ============================================================
-- NuraWell — Ops admin notifications + transcript deny note
-- Migration: 000080_ops_admin_notifications.sql
-- ============================================================

SET lock_timeout = '120s';

ALTER TABLE public.chat_transcript_access_requests
  ADD COLUMN IF NOT EXISTS user_response_note TEXT;

COMMENT ON COLUMN public.chat_transcript_access_requests.user_response_note IS
  'הערת משתמש בעת דחיית בקשת גישה (אופציונלי).';

CREATE TABLE IF NOT EXISTS public.ops_admin_notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type            TEXT NOT NULL,
  title           TEXT NOT NULL,
  body            TEXT NOT NULL,
  icon_emoji      TEXT NOT NULL DEFAULT '🔔',
  action_url      TEXT,
  is_read         BOOLEAN NOT NULL DEFAULT FALSE,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ops_admin_notif_admin_unread
  ON public.ops_admin_notifications (admin_user_id, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ops_admin_notif_created
  ON public.ops_admin_notifications (created_at DESC);

COMMENT ON TABLE public.ops_admin_notifications IS
  'התראות פנימיות לפאנל Ops — אישור/דחיית בקשות תמליל, הסכמות ועוד.';

ALTER TABLE public.ops_admin_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ops_admin_notif_select_own" ON public.ops_admin_notifications;
CREATE POLICY "ops_admin_notif_select_own"
  ON public.ops_admin_notifications FOR SELECT TO authenticated
  USING (admin_user_id = auth.uid() AND public.nura_is_admin());

DROP POLICY IF EXISTS "ops_admin_notif_update_own" ON public.ops_admin_notifications;
CREATE POLICY "ops_admin_notif_update_own"
  ON public.ops_admin_notifications FOR UPDATE TO authenticated
  USING (admin_user_id = auth.uid() AND public.nura_is_admin())
  WITH CHECK (admin_user_id = auth.uid() AND public.nura_is_admin());
