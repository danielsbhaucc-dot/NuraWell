-- ============================================================
-- NuraWell — Assignment relations (smart blocker ladder)
-- Migration: 000051_assignment_relations.sql
--
-- מקשר צעד שנוצר מהתערבות-חסם למשימה המקורית שהוא נוגע בה, ומסמן את סוג
-- היחס: מחליף / מקל / תומך. כך אלמוג יכול להקל בהדרגה ולהחזיר למשימה המקורית,
-- או להחליף אותה בצעד דומה מספיק — בלי לערום משימות כפולות.
-- ============================================================

ALTER TABLE public.almog_assignments
  ADD COLUMN IF NOT EXISTS parent_assignment_id UUID
    REFERENCES public.almog_assignments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS relation TEXT NOT NULL DEFAULT 'standalone'
    CHECK (relation IN ('standalone', 'replaces', 'eases', 'supports'));

COMMENT ON COLUMN public.almog_assignments.parent_assignment_id IS
  'The original assignment this step relates to (when created from a blocker intervention).';

COMMENT ON COLUMN public.almog_assignments.relation IS
  'Relation to parent: standalone|replaces (substitutes original)|eases (temporary easier version)|supports (additive helper).';

CREATE INDEX IF NOT EXISTS idx_almog_assignments_parent
  ON public.almog_assignments (parent_assignment_id)
  WHERE parent_assignment_id IS NOT NULL;
