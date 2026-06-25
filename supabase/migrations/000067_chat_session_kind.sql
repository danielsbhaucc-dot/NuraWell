-- סוג שיחה: רגילה מול תיעוד עדכון פרופיל (ללא פתיחה מחדש)
ALTER TABLE public.chat_sessions
  ADD COLUMN IF NOT EXISTS session_kind TEXT NOT NULL DEFAULT 'chat'
    CHECK (session_kind IN ('chat', 'profile_update'));

COMMENT ON COLUMN public.chat_sessions.session_kind IS
  'chat = שיחה רגילה; profile_update = תיעוד סגור של עדכון פרופיל (ללא transcript).';

CREATE INDEX IF NOT EXISTS idx_chat_sessions_profile_updates
  ON public.chat_sessions (user_id, updated_at DESC)
  WHERE session_kind = 'profile_update';
