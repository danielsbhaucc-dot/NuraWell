-- ============================================================
-- NuraWell — Daily Action Instances (מעקב צעדים דינמיים / Pivots)
-- Migration: 000055_daily_action_instances.sql
--
-- כשה-AI מציע צעד-מיקרו (pivot) והמשתמש מקבל אותו, הצעד הזה אינו "טקסט"
-- בלבד — הוא משימה עם מחזור-חיים משלה. הטבלה מחזיקה את "המשימה של היום"
-- (instance אחד לכל user ליום), כדי שהאורקסטרטור יוכל להעריך את הסטטוס שלה
-- ולנהל מסלול חזרה הדרגתי ליעד המקורי (progression path).
--
-- "today's instance" מוגדר חד-משמעית ע"י UNIQUE(user_id, date_key), כך
-- שה-override של ה-pivot הוא upsert נקי.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.daily_action_instances (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- YYYY-MM-DD בלוח ירושלים — היום שאליו ה-instance שייך.
  date_key          TEXT NOT NULL,
  display_title     TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'completed', 'skipped')),
  is_pivot          BOOLEAN NOT NULL DEFAULT FALSE,
  -- היעד המקורי שאליו "מטפסים בחזרה" אחרי pivot מוצלח.
  original_title    TEXT,
  -- 0 = צעד המיקרו הראשוני; עולה בכל יום מוצלח עד היעד המלא.
  progression_step  INTEGER NOT NULL DEFAULT 0,
  -- ההצעה היזומה (pending_ai_proposal.id) שיצרה את ה-pivot.
  pivot_proposal_id UUID,
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at      TIMESTAMPTZ,
  UNIQUE (user_id, date_key)
);

COMMENT ON TABLE public.daily_action_instances IS
  'Today''s tracked action per user (one per day). Dynamic pivots override display_title and set is_pivot=true; the orchestrator climbs progression_step back to original_title over several days.';

CREATE INDEX IF NOT EXISTS idx_daily_action_instances_user_date
  ON public.daily_action_instances (user_id, date_key DESC);

-- שליפת ה-pivot האחרון של המשתמש להערכת ה-cluster (requirement 3).
CREATE INDEX IF NOT EXISTS idx_daily_action_instances_user_pivot
  ON public.daily_action_instances (user_id, date_key DESC)
  WHERE is_pivot = TRUE;

ALTER TABLE public.daily_action_instances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS daily_action_instances_select_own ON public.daily_action_instances;
CREATE POLICY daily_action_instances_select_own
  ON public.daily_action_instances FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS daily_action_instances_insert_own ON public.daily_action_instances;
CREATE POLICY daily_action_instances_insert_own
  ON public.daily_action_instances FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS daily_action_instances_update_own ON public.daily_action_instances;
CREATE POLICY daily_action_instances_update_own
  ON public.daily_action_instances FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
