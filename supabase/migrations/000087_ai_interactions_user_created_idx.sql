-- שאילתות orchestrator/master לפי user + טווח זמן (בלי סריקה על created_at גלובלי בלבד).
CREATE INDEX IF NOT EXISTS idx_ai_interactions_user_created
  ON public.ai_interactions (user_id, created_at DESC);

-- סיבוב אורקסטרטור לפי program_state_updated_at.
CREATE INDEX IF NOT EXISTS idx_profiles_program_state_updated_at
  ON public.profiles (program_state_updated_at ASC NULLS FIRST)
  WHERE onboarding_completed = TRUE;
