-- ============================================================
-- NuraWell — Program Orchestrator (לב הפעימה של המסע)
-- Migration: 000054_program_orchestrator.sql
--
-- מוסיף ל-profiles את שני השדות שעליהם נשען ה-"Program Orchestrator":
--
--   program_state         — המצב הנוכחי של המשתמש בתוכנית, כפי שה-cron
--                           מעריך אותו (ready_to_advance | maintaining |
--                           struggling). מקור אמת אחד שגם ה-UI קורא.
--
--   pending_ai_proposal   — ההצעה היזומה האחרונה שה-AI ניסח וטרם נענתה.
--                           ה-Frontend הוא "Dumb UI": הוא פשוט מצייר את מה
--                           שמופיע כאן. NULL = אין הצעה פתוחה → מסך בית רגיל.
--
-- הערה ארכיטקטונית: בחרנו עמודות אמת (כמו engagement_status ב-000044) ולא
-- שדה ב-ai_context, כי program_state נקרא ב-client ב-hot path של מסך הבית
-- ומשמש גם לאינדוקס/אנליטיקה, ו-pending_ai_proposal צריך להיות נעדכן/נמחק
-- אטומית בלי לדרוס את שאר ai_context.
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS program_state TEXT
    CHECK (program_state IN ('ready_to_advance', 'maintaining', 'struggling')),
  ADD COLUMN IF NOT EXISTS program_state_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pending_ai_proposal JSONB;

COMMENT ON COLUMN public.profiles.program_state IS
  'Program Orchestrator state evaluated by the 30-min cron: ready_to_advance | maintaining | struggling. NULL = not yet evaluated.';

COMMENT ON COLUMN public.profiles.program_state_updated_at IS
  'When program_state was last recomputed by the orchestrator.';

COMMENT ON COLUMN public.profiles.pending_ai_proposal IS
  'Latest unanswered AI proposal the dumb UI renders (level_up locks home; daily_kickoff/pivot are dismissible cards). NULL = no open proposal. Cleared when the user accepts/declines or it expires next day.';

-- אינדקס חלקי — שליפת המשתמשים שיש להם הצעה פתוחה (לאנליטיקה/ניטור).
CREATE INDEX IF NOT EXISTS idx_profiles_pending_ai_proposal
  ON public.profiles (id)
  WHERE pending_ai_proposal IS NOT NULL;
