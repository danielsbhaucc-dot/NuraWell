-- ============================================================
-- NuraWell — Almog system knowledge (source of truth for RAG)
-- Migration: 000036_almog_knowledge.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS public.almog_knowledge (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT        NOT NULL DEFAULT '',
  body            TEXT        NOT NULL,
  data_type       TEXT        NOT NULL CHECK (data_type IN ('step', 'course')),
  access_level    TEXT        NOT NULL DEFAULT 'public' CHECK (access_level IN ('public', 'premium')),
  step_id         UUID        REFERENCES public.journey_steps(id) ON DELETE SET NULL,
  course_id       TEXT,
  step_number     INTEGER,
  station_id      UUID,
  station_title   TEXT,
  station_order   INTEGER,
  chunk_count     INTEGER     NOT NULL DEFAULT 0,
  created_by      UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS almog_knowledge_data_type_idx
  ON public.almog_knowledge (data_type);

CREATE INDEX IF NOT EXISTS almog_knowledge_step_id_idx
  ON public.almog_knowledge (step_id)
  WHERE step_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS almog_knowledge_course_id_idx
  ON public.almog_knowledge (course_id)
  WHERE course_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS almog_knowledge_updated_at_idx
  ON public.almog_knowledge (updated_at DESC);

DROP TRIGGER IF EXISTS update_almog_knowledge_updated_at ON public.almog_knowledge;
CREATE TRIGGER update_almog_knowledge_updated_at
  BEFORE UPDATE ON public.almog_knowledge
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.almog_knowledge ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_almog_knowledge" ON public.almog_knowledge;
CREATE POLICY "admin_all_almog_knowledge" ON public.almog_knowledge
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.almog_knowledge TO authenticated;
GRANT ALL ON public.almog_knowledge TO service_role;

COMMENT ON TABLE public.almog_knowledge IS
  'מקור אמת לידע מערכת של אלמוג (RAG). וקטורים ב-Upstash namespace system-knowledge נגזרים מכאן.';
