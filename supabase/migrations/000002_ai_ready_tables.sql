-- ============================================================
-- NuraWell - AI-Ready Tables Migration
-- Migration: 000002_ai_ready_tables.sql
-- Description: Adds AI interactions, user plans, notifications,
--              and lesson activity tables for full AI integration.
-- ============================================================

-- ============================================================
-- 1. AI INTERACTIONS TABLE
-- Stores every AI conversation/interaction for context & analytics
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ai_interactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_id      UUID NOT NULL DEFAULT gen_random_uuid(),
  role            TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content         TEXT NOT NULL,
  context_type    TEXT CHECK (context_type IN ('general', 'lesson', 'progress', 'nutrition', 'exercise', 'motivation')),
  context_id      UUID,  -- lesson_id or course_id if contextual
  tokens_used     INTEGER,
  model_name      TEXT DEFAULT 'gpt-4o',
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_interactions_user_id    ON public.ai_interactions (user_id);
CREATE INDEX IF NOT EXISTS idx_ai_interactions_session_id ON public.ai_interactions (session_id);
CREATE INDEX IF NOT EXISTS idx_ai_interactions_created_at ON public.ai_interactions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_interactions_context    ON public.ai_interactions (context_type, context_id);

-- ============================================================
-- 2. USER PLANS TABLE
-- AI-generated personalized plans (nutrition, exercise, weekly)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_plans (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan_type       TEXT NOT NULL CHECK (plan_type IN ('weekly', 'nutrition', 'exercise', 'custom')),
  title           TEXT NOT NULL,
  description     TEXT,
  plan_data       JSONB NOT NULL DEFAULT '{}',
  -- plan_data structure: { days: [{date, tasks:[{title,done}], meals:[{name,calories}]}] }
  ai_generated    BOOLEAN DEFAULT TRUE,
  is_active       BOOLEAN DEFAULT TRUE,
  starts_at       DATE NOT NULL DEFAULT CURRENT_DATE,
  ends_at         DATE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_plans_user_id  ON public.user_plans (user_id);
CREATE INDEX IF NOT EXISTS idx_user_plans_active   ON public.user_plans (user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_user_plans_type     ON public.user_plans (user_id, plan_type);

-- ============================================================
-- 3. NOTIFICATIONS TABLE
-- App notifications (push-ready), AI-triggered and system
-- ============================================================
CREATE TABLE IF NOT EXISTS public.notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type            TEXT NOT NULL CHECK (type IN ('lesson_reminder', 'achievement', 'streak', 'ai_message', 'plan_ready', 'system')),
  title           TEXT NOT NULL,
  body            TEXT NOT NULL,
  icon_emoji      TEXT DEFAULT '🔔',
  action_url      TEXT,
  is_read         BOOLEAN DEFAULT FALSE,
  is_sent         BOOLEAN DEFAULT FALSE,
  send_at         TIMESTAMPTZ DEFAULT NOW(),
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id  ON public.notifications (user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread   ON public.notifications (user_id, is_read) WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS idx_notifications_send_at  ON public.notifications (send_at);

-- ============================================================
-- 4. USER MEASUREMENTS TABLE
-- Body measurements over time for progress tracking
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_measurements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  measured_at     DATE NOT NULL DEFAULT CURRENT_DATE,
  weight_kg       DECIMAL(5,2),
  height_cm       DECIMAL(5,1),
  bmi             DECIMAL(4,2),
  body_fat_pct    DECIMAL(4,1),
  waist_cm        DECIMAL(5,1),
  hip_cm          DECIMAL(5,1),
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_measurements_user_id   ON public.user_measurements (user_id);
CREATE INDEX IF NOT EXISTS idx_measurements_date      ON public.user_measurements (user_id, measured_at DESC);

-- ============================================================
-- 5. ACHIEVEMENTS TABLE
-- Gamification: earned badges and achievements
-- ============================================================
CREATE TABLE IF NOT EXISTS public.achievements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  achievement_key TEXT NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT,
  icon_emoji      TEXT DEFAULT '🏆',
  earned_at       TIMESTAMPTZ DEFAULT NOW(),
  metadata        JSONB DEFAULT '{}'
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_achievements_unique ON public.achievements (user_id, achievement_key);
CREATE INDEX IF NOT EXISTS idx_achievements_user_id ON public.achievements (user_id);

-- ============================================================
-- 6. UPDATED_AT TRIGGERS for new tables
-- ============================================================
CREATE OR REPLACE TRIGGER update_user_plans_updated_at
  BEFORE UPDATE ON public.user_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 7. ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE public.ai_interactions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_plans         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_measurements  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.achievements       ENABLE ROW LEVEL SECURITY;

-- ai_interactions: users see/manage their own
CREATE POLICY "users_own_ai_interactions" ON public.ai_interactions
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "admins_view_ai_interactions" ON public.ai_interactions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- user_plans: users manage their own
CREATE POLICY "users_own_plans" ON public.user_plans
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "admins_manage_plans" ON public.user_plans
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- notifications: users see their own
CREATE POLICY "users_own_notifications" ON public.notifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "users_update_notifications" ON public.notifications
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "admins_manage_notifications" ON public.notifications
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- user_measurements: users manage their own
CREATE POLICY "users_own_measurements" ON public.user_measurements
  FOR ALL USING (auth.uid() = user_id);

-- achievements: users see their own
CREATE POLICY "users_own_achievements" ON public.achievements
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "service_role_manage_achievements" ON public.achievements
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- 8. ADD COLUMNS TO PROFILES for AI personalization
-- ============================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS goal_weight_kg     DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS current_weight_kg  DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS height_cm          DECIMAL(5,1),
  ADD COLUMN IF NOT EXISTS date_of_birth      DATE,
  ADD COLUMN IF NOT EXISTS gender             TEXT CHECK (gender IN ('male', 'female', 'other', 'prefer_not_to_say')),
  ADD COLUMN IF NOT EXISTS activity_level     TEXT CHECK (activity_level IN ('sedentary', 'light', 'moderate', 'active', 'very_active')) DEFAULT 'moderate',
  ADD COLUMN IF NOT EXISTS dietary_preferences JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS health_conditions  JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS ai_context         JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS notification_prefs JSONB DEFAULT '{"push": true, "email": true, "daily_reminder": true}',
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS streak_days        INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_active_at     TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_profiles_streak ON public.profiles (streak_days DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_last_active ON public.profiles (last_active_at DESC);
