-- ============================================================
-- NuraWell — Transcript access request tracking timestamps
-- Migration: 000081_transcript_access_tracking.sql
-- ============================================================

ALTER TABLE public.chat_transcript_access_requests
  ADD COLUMN IF NOT EXISTS notification_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS user_viewed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.chat_transcript_access_requests.notification_sent_at IS
  'מועד שליחת התראה in-app/push למשתמש על הבקשה.';
COMMENT ON COLUMN public.chat_transcript_access_requests.user_viewed_at IS
  'מועד שבו המשתמש פתח/צפה בבקשה (הגדרות פרטיות).';

CREATE INDEX IF NOT EXISTS idx_chat_transcript_access_session_created
  ON public.chat_transcript_access_requests (session_id, created_at DESC)
  WHERE session_id IS NOT NULL;
