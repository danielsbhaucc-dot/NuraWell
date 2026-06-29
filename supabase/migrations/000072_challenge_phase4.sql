-- ============================================================
-- NuraWell — Challenge phase 4: celebrations, public stats
-- Migration: 000072_challenge_phase4.sql
-- ============================================================

-- celebration_key on task definitions (variable reward UI)
UPDATE public.challenge_task_definitions
SET celebration_key = CASE task_key
  WHEN 'water_morning' THEN 'droplets'
  WHEN 'water_before_meals' THEN 'droplets'
  WHEN 'eating_window' THEN 'clock'
  WHEN 'walk_after_meal' THEN 'footprints'
  WHEN 'clean_meal' THEN 'leaf'
  WHEN 'protein_veg' THEN 'salad'
  WHEN 'sleep_buffer' THEN 'moon'
  ELSE 'sparkle'
END
WHERE celebration_key IS NULL;

-- Aggregate stats for social proof (no PII)
CREATE OR REPLACE FUNCTION public.challenge_public_stats()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'active_participants',
    (
      SELECT count(*)::int
      FROM public.challenge_enrollments
      WHERE is_demo = false
        AND status IN ('waiting', 'active')
    ),
    'completed_participants',
    (
      SELECT count(*)::int
      FROM public.challenge_enrollments
      WHERE is_demo = false
        AND status = 'completed'
    )
  );
$$;

REVOKE ALL ON FUNCTION public.challenge_public_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.challenge_public_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.challenge_public_stats() TO anon;
