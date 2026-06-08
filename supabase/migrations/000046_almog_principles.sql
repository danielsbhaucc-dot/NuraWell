-- ============================================================
-- NuraWell — Almog principles (עקרונות/חוקי תוכנית והנחיות התנהלות)
-- Migration: 000046_almog_principles.sql
--
-- מרחיב את almog_knowledge כך ש-data_type יכול להיות גם 'principle':
-- עקרונות בשפה טבעית שאלמוג שולף מהצ'אט לפי הצורך (לא תלויים בצעד/קורס).
-- ============================================================

ALTER TABLE public.almog_knowledge
  DROP CONSTRAINT IF EXISTS almog_knowledge_data_type_check;

ALTER TABLE public.almog_knowledge
  ADD CONSTRAINT almog_knowledge_data_type_check
  CHECK (data_type IN ('step', 'course', 'principle'));

COMMENT ON COLUMN public.almog_knowledge.data_type IS
  'step | course | principle — principle = עקרון/חוק תוכנית גלובלי (ללא שיוך לצעד/קורס), נשלף סמנטית מהצ׳אט.';
