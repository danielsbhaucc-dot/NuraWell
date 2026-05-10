-- ארכיון התראות + אינדקס לרשימות ארוכות (פילטרים / עימוד)

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

COMMENT ON COLUMN public.notifications.archived_at IS 'כשמלא — ההתראה מוסתרת מהתיבה הראשית ומופיעה תחת ארכיון';

CREATE INDEX IF NOT EXISTS idx_notifications_user_inbox
  ON public.notifications (user_id, archived_at, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications (user_id, is_read)
  WHERE is_read = FALSE AND archived_at IS NULL;
