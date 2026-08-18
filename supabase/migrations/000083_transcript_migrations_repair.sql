-- ============================================================
-- NuraWell — Safe repair: migrations 080–082 (idempotent, retry after deadlock)
-- Migration: 000083_transcript_migrations_repair.sql
--
-- אם קיבלת deadlock ב-080/081/082 — הרץ db push שוב, או הדבק ב-SQL Editor
-- בזמן תעבורה נמוכה (לא במקביל ל-migration runner אחר).
-- ============================================================

SET lock_timeout = '120s';
SET statement_timeout = '300s';

-- ── 080: deny note + ops admin notifications ──
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

-- ── 081: tracking timestamps (single ALTER = פחות נעילות) ──
ALTER TABLE public.chat_transcript_access_requests
  ADD COLUMN IF NOT EXISTS notification_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS user_viewed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_chat_transcript_access_session_created
  ON public.chat_transcript_access_requests (session_id, created_at DESC)
  WHERE session_id IS NOT NULL;

-- ── 082: notification types + cancel columns ──
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (
  type IN (
    'lesson_reminder',
    'achievement',
    'streak',
    'ai_message',
    'plan_ready',
    'system',
    'transcript_access_request',
    'chat_transcript_delivered'
  )
);

ALTER TABLE public.chat_transcript_access_requests
  DROP CONSTRAINT IF EXISTS chat_transcript_access_requests_status_check;

ALTER TABLE public.chat_transcript_access_requests
  ADD CONSTRAINT chat_transcript_access_requests_status_check CHECK (
    status IN ('pending', 'approved', 'denied', 'expired', 'cancelled')
  );

ALTER TABLE public.chat_transcript_access_requests
  ADD COLUMN IF NOT EXISTS notification_id UUID REFERENCES public.notifications(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by_admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
