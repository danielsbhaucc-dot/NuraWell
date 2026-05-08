-- ============================================================
-- NuraWell - AI Memory + Journey Task Decisions
-- Migration: 000004_ai_memory_and_task_statuses.sql
-- ============================================================

-- 1) Dedicated AI memory table (if missing)
CREATE TABLE IF NOT EXISTS public.user_ai_memory (
  user_id      UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  memory       JSONB NOT NULL DEFAULT '{}',
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER update_user_ai_memory_updated_at
  BEFORE UPDATE ON public.user_ai_memory
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.user_ai_memory ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_ai_memory'
      AND policyname = 'users_own_ai_memory'
  ) THEN
    CREATE POLICY "users_own_ai_memory" ON public.user_ai_memory
      FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_ai_memory'
      AND policyname = 'service_role_manage_ai_memory'
  ) THEN
    CREATE POLICY "service_role_manage_ai_memory" ON public.user_ai_memory
      FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

-- 2) Task-level decision status for journey summary ("accepted/rejected/pending")
ALTER TABLE public.journey_progress
  ADD COLUMN IF NOT EXISTS task_statuses JSONB NOT NULL DEFAULT '{}';

-- Backfill from tasks_completed => accepted/rejected
UPDATE public.journey_progress
SET task_statuses = COALESCE(
  (
    SELECT jsonb_object_agg(
      key,
      jsonb_build_object(
        'status',
        CASE WHEN value = 'true'::jsonb THEN 'accepted' ELSE 'rejected' END,
        'decided_at',
        updated_at
      )
    )
    FROM jsonb_each(tasks_completed)
  ),
  '{}'
)
WHERE (
  task_statuses IS NULL
  OR task_statuses = '{}'::jsonb
)
AND jsonb_typeof(tasks_completed) = 'object'
AND EXISTS (
  SELECT 1
  FROM jsonb_each(tasks_completed)
);
