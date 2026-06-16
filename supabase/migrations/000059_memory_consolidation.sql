-- ============================================================
-- NuraWell — Autonomous Memory Manager
-- Migration: 000059_memory_consolidation.sql
--
-- מכונת מצבים ל-user_insights (status) + תור pending_chat_logs
-- לעיבוד אצווה יומי (Memory Consolidation) במקום LLM בכל הודעה.
-- ============================================================

-- ── status על user_insights ──────────────────────────────────
ALTER TABLE public.user_insights
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'DEPRECATED', 'NEEDS_VERIFICATION'));

COMMENT ON COLUMN public.user_insights.status IS
  'מצב תובנה: ACTIVE=בשימוש, DEPRECATED=לא רלוונטי, NEEDS_VERIFICATION=המנטור צריך לאמת מול המשתמש.';

UPDATE public.user_insights
SET status = CASE WHEN is_active THEN 'ACTIVE' ELSE 'DEPRECATED' END
WHERE status IS NULL OR (is_active = FALSE AND status = 'ACTIVE');

-- שמירה על תאימות לאחור: is_active מסתנכרן מ-status
CREATE OR REPLACE FUNCTION public.sync_user_insight_is_active_from_status()
RETURNS TRIGGER AS $$
BEGIN
  NEW.is_active := (NEW.status = 'ACTIVE');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_user_insight_is_active_from_status ON public.user_insights;
CREATE TRIGGER sync_user_insight_is_active_from_status
  BEFORE INSERT OR UPDATE OF status ON public.user_insights
  FOR EACH ROW EXECUTE FUNCTION public.sync_user_insight_is_active_from_status();

CREATE INDEX IF NOT EXISTS idx_user_insights_status_active_ranked
  ON public.user_insights (user_id, actionability_score DESC, last_seen_at DESC)
  WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_user_insights_needs_verification
  ON public.user_insights (user_id, updated_at DESC)
  WHERE status = 'NEEDS_VERIFICATION';

-- ── pending_chat_logs — אגירה זולה במהלך היום ───────────────
CREATE TABLE IF NOT EXISTS public.pending_chat_logs (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  raw_chat_text      TEXT NOT NULL,
  source_session_id  UUID,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed          BOOLEAN NOT NULL DEFAULT FALSE,
  processed_at       TIMESTAMPTZ
);

COMMENT ON TABLE public.pending_chat_logs IS
  'תור צ''אטים גולמיים לעיבוד אצווה יומי (Memory Consolidation). ללא ניתוח LLM בזמן אמת.';

CREATE INDEX IF NOT EXISTS idx_pending_chat_logs_unprocessed
  ON public.pending_chat_logs (created_at ASC)
  WHERE processed = FALSE;

CREATE INDEX IF NOT EXISTS idx_pending_chat_logs_user_unprocessed
  ON public.pending_chat_logs (user_id, created_at ASC)
  WHERE processed = FALSE;

ALTER TABLE public.pending_chat_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pending_chat_logs_service_role_all ON public.pending_chat_logs;
CREATE POLICY pending_chat_logs_service_role_all
  ON public.pending_chat_logs FOR ALL TO service_role
  USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS pending_chat_logs_select_own ON public.pending_chat_logs;
CREATE POLICY pending_chat_logs_select_own
  ON public.pending_chat_logs FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
