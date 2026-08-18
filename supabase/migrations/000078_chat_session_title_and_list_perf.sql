-- ============================================================
-- NuraWell — Chat session title + list-query performance
-- Migration: 000078_chat_session_title_and_list_perf.sql
-- ============================================================

ALTER TABLE public.chat_sessions
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS preview_text TEXT,
  ADD COLUMN IF NOT EXISTS message_count INT NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.chat_sessions.title IS
  'שם ענייני לשיחה — נוצר במודל זול (Llama 4) במהלך/בסיום הסשן.';
COMMENT ON COLUMN public.chat_sessions.preview_text IS
  'תצוגה מקדימה לרשימת שיחות — הודעה אחרונה, בלי JOIN ל-ai_interactions.';
COMMENT ON COLUMN public.chat_sessions.message_count IS
  'מספר הודעות user+assistant בסשן — מתעדכן בכל תור.';

CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_updated
  ON public.chat_sessions (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_interactions_user_session_created
  ON public.ai_interactions (user_id, session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_interactions_session_created
  ON public.ai_interactions (session_id, created_at DESC);

-- מונה + תצוגה מקדימה אטומית לכל תור (RLS חל על הטבלה; service_role עוקף).
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
    preview_text = COALESCE(LEFT(NULLIF(BTRIM(p_preview), ''), 280), preview_text),
    updated_at = NOW()
  WHERE id = p_session_id
    AND user_id = p_user_id
    AND (auth.uid() IS NULL OR auth.uid() = p_user_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.bump_chat_session_turn(uuid, uuid, text)
  TO authenticated, service_role;

-- אדמין: עדכון/מחיקה של שיחות (ה-API משתמש ב-service_role; המדיניות לגיבוי JWT)
DROP POLICY IF EXISTS "admins_manage_chat_sessions" ON public.chat_sessions;
CREATE POLICY "admins_manage_chat_sessions" ON public.chat_sessions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

UPDATE public.chat_sessions cs
SET
  message_count = COALESCE(stats.cnt, 0),
  preview_text = COALESCE(stats.preview, cs.preview_text)
FROM (
  SELECT
    i.session_id,
    COUNT(*)::int AS cnt,
    (
      SELECT LEFT(BTRIM(i2.content), 280)
      FROM public.ai_interactions i2
      WHERE i2.session_id = i.session_id
        AND i2.role IN ('user', 'assistant')
        AND BTRIM(i2.content) <> ''
      ORDER BY i2.created_at DESC
      LIMIT 1
    ) AS preview
  FROM public.ai_interactions i
  WHERE i.role IN ('user', 'assistant')
  GROUP BY i.session_id
) stats
WHERE cs.id = stats.session_id;
