-- ============================================================
-- NuraWell — Transcript access: notification link + cancel status
-- Migration: 000082_transcript_access_cancel_and_notify.sql
-- ============================================================

-- הרחבת סוגי התראות (תמליל/פרטיות)
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

COMMENT ON COLUMN public.chat_transcript_access_requests.notification_id IS
  'קישור להתראה in-app שנשלחה למשתמש — נמחק/מבוטל עם ביטול הבקשה.';
