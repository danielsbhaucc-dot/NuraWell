-- preview_text מגיע עכשיו כ-ciphertext (enc:v1:...) — הקיצוץ ל-280 נעשה באפליקציה לפני ההצפנה.
-- LEFT() על ciphertext היה משחית אותו, לכן מוסר.
CREATE OR REPLACE FUNCTION public.bump_chat_session_turn(
  p_session_id uuid,
  p_user_id uuid,
  p_preview text
) RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.chat_sessions
  SET
    message_count = COALESCE(message_count, 0) + 1,
    preview_text = COALESCE(NULLIF(BTRIM(p_preview), ''), preview_text),
    updated_at = NOW()
  WHERE id = p_session_id
    AND user_id = p_user_id
    AND (auth.uid() IS NULL OR auth.uid() = p_user_id);
END;
$$;

COMMENT ON COLUMN public.chat_sessions.title IS 'app-level AES-256-GCM ciphertext (enc:v1:) bound to user_id';
COMMENT ON COLUMN public.chat_sessions.summary IS 'app-level AES-256-GCM ciphertext (enc:v1:) bound to user_id';
COMMENT ON COLUMN public.chat_sessions.preview_text IS 'app-level AES-256-GCM ciphertext (enc:v1:) bound to user_id';
COMMENT ON COLUMN public.pending_chat_logs.raw_chat_text IS 'app-level AES-256-GCM ciphertext (enc:v1:) bound to user_id';
COMMENT ON COLUMN public.user_memories.memory_text IS 'app-level AES-256-GCM ciphertext (enc:v1:) bound to user_id';
COMMENT ON COLUMN public.user_insights.insight_text IS 'app-level AES-256-GCM ciphertext (enc:v1:) bound to user_id';
COMMENT ON COLUMN public.chat_periodic_summaries.ai_insight IS 'app-level AES-256-GCM ciphertext (enc:v1:) bound to user_id';

-- ciphertext ארוך מהטקסט; האורך נאכף באפליקציה (persist-memory) לפני ההצפנה.
ALTER TABLE public.user_memories DROP CONSTRAINT IF EXISTS user_memories_text_len;
ALTER TABLE public.user_memories ADD CONSTRAINT user_memories_text_len CHECK (char_length(memory_text) BETWEEN 4 AND 4000);
