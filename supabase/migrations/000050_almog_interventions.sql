-- ============================================================
-- NuraWell — Almog Friction Engine & Interventions Log
-- Migration: 000050_almog_interventions.sql
--
-- הרחבת almog_blockers לסיווג friction + אופציות A/B פעילות,
-- וטבלת almog_interventions לזיכרון ארוך-טווח (מה עבד / לא עבד).
-- ============================================================

-- ------------------------------------------------------------
-- 1) הרחבת almog_blockers
-- ------------------------------------------------------------
ALTER TABLE public.almog_blockers
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_options JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.almog_blockers.category IS
  'Friction category: logistical|physiological|cognitive|emotional|social|knowledge|motivational';

COMMENT ON COLUMN public.almog_blockers.current_options IS
  'Active A/B options shown in Plans UI: [{ id, label, strategy_type, micro_step }]';

-- ------------------------------------------------------------
-- 2) almog_interventions — לוג התערבויות (interventions_log)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.almog_interventions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocker_id      UUID NOT NULL REFERENCES public.almog_blockers(id) ON DELETE CASCADE,
  barrier_type    TEXT NOT NULL,
  strategy        TEXT NOT NULL,
  strategy_type   TEXT NOT NULL,
  outcome         TEXT NOT NULL DEFAULT 'pending'
                    CHECK (outcome IN ('pending', 'helped', 'not_helped', 'resolved')),
  assignment_id   UUID REFERENCES public.almog_assignments(id) ON DELETE SET NULL,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at     TIMESTAMPTZ
);

COMMENT ON TABLE public.almog_interventions IS
  'Long-term memory of what strategies worked or failed per user/barrier type — feeds pivot logic and Almog context.';

CREATE INDEX IF NOT EXISTS idx_almog_interventions_user_barrier
  ON public.almog_interventions (user_id, barrier_type, outcome, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_almog_interventions_blocker
  ON public.almog_interventions (blocker_id, created_at DESC);

-- ------------------------------------------------------------
-- 3) RLS — authenticated reads own rows only
-- ------------------------------------------------------------
ALTER TABLE public.almog_interventions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS almog_interventions_select_own ON public.almog_interventions;
CREATE POLICY almog_interventions_select_own
  ON public.almog_interventions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ------------------------------------------------------------
-- 4) Realtime (Plans page live updates)
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'almog_interventions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.almog_interventions;
  END IF;
END $$;
