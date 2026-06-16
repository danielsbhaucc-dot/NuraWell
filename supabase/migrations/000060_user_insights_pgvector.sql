-- ============================================================
-- NuraWell — Semantic recall for user_insights (pgvector)
-- Migration: 000060_user_insights_pgvector.sql
-- ============================================================

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE public.user_insights
  ADD COLUMN IF NOT EXISTS embedding vector(1536);

COMMENT ON COLUMN public.user_insights.embedding IS
  'Embedding של insight_text (text-embedding-3-small, 1536) לחיפוש סמנטי ב-recall_past_memory. שורות קיימות: הרץ scripts/backfill-insight-embeddings.mjs אחרי המיגרציה.';

CREATE INDEX IF NOT EXISTS idx_user_insights_embedding_hnsw
  ON public.user_insights
  USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;

-- ============================================================
-- RPC: חיפוש סמנטי לפי cosine similarity
-- ============================================================

CREATE OR REPLACE FUNCTION public.match_user_insights(
  query_embedding   vector(1536),
  match_threshold   float,
  match_count       int,
  p_user_id         uuid,
  p_categories      text[] DEFAULT NULL
)
RETURNS TABLE (
  id            uuid,
  insight_text  text,
  status        text,
  category      text,
  created_at    timestamptz,
  updated_at    timestamptz,
  similarity    float
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ui.id,
    ui.insight_text,
    ui.status,
    ui.category,
    ui.created_at,
    ui.updated_at,
    (1 - (ui.embedding <=> query_embedding))::float AS similarity
  FROM public.user_insights ui
  WHERE ui.user_id = p_user_id
    AND ui.embedding IS NOT NULL
    AND (p_categories IS NULL OR ui.category = ANY(p_categories))
    AND (1 - (ui.embedding <=> query_embedding)) >= match_threshold
  ORDER BY ui.embedding <=> query_embedding ASC, ui.created_at DESC
  LIMIT GREATEST(1, LEAST(match_count, 20));
$$;

COMMENT ON FUNCTION public.match_user_insights IS
  'Semantic search over user_insights.embedding for contextual memory recall.';

REVOKE ALL ON FUNCTION public.match_user_insights(vector, float, int, uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_user_insights(vector, float, int, uuid, text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.match_user_insights(vector, float, int, uuid, text[]) TO authenticated;
