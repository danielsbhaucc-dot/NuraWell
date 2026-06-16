-- ============================================================
-- NuraWell — מעבר לעמודות שטוחות (אם 000057 הישנה עם profile JSONB כבר הורצה)
-- Migration: 000058_user_mentorship_strategy_flat_columns.sql
-- ============================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_mentorship_strategy'
      AND column_name = 'profile'
  ) THEN
    ALTER TABLE public.user_mentorship_strategy
      ADD COLUMN IF NOT EXISTS psychological_approach TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS active_blockers TEXT[] NOT NULL DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS current_focus TEXT[] NOT NULL DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS medical_red_flags TEXT[] NOT NULL DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS next_best_action TEXT NOT NULL DEFAULT '';

    UPDATE public.user_mentorship_strategy
    SET
      psychological_approach = COALESCE(profile->>'psychological_approach', ''),
      active_blockers = COALESCE(
        ARRAY(SELECT jsonb_array_elements_text(profile->'active_blockers')),
        '{}'::text[]
      ),
      current_focus = COALESCE(
        ARRAY(SELECT jsonb_array_elements_text(profile->'current_focus')),
        '{}'::text[]
      ),
      medical_red_flags = COALESCE(
        ARRAY(SELECT jsonb_array_elements_text(profile->'medical_red_flags')),
        '{}'::text[]
      ),
      next_best_action = COALESCE(
        NULLIF(profile->>'next_best_action', ''),
        NULLIF(profile->>'next_best_action_for_mentor', ''),
        ''
      )
    WHERE profile IS NOT NULL AND profile <> '{}'::jsonb;

    ALTER TABLE public.user_mentorship_strategy
      DROP COLUMN IF EXISTS profile,
      DROP COLUMN IF EXISTS source_insight_count,
      DROP COLUMN IF EXISTS synthesis_model,
      DROP COLUMN IF EXISTS synthesized_at,
      DROP COLUMN IF EXISTS created_at;

    DROP INDEX IF EXISTS idx_user_mentorship_strategy_synthesized_at;
    CREATE INDEX IF NOT EXISTS idx_user_mentorship_strategy_updated_at
      ON public.user_mentorship_strategy (updated_at DESC);
  END IF;
END $$;
