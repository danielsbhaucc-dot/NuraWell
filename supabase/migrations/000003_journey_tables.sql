-- ============================================================
-- NuraWell - Journey Steps Migration
-- Migration: 000003_journey_tables.sql
-- Description: Adds journey_steps and journey_progress tables
--              for the interactive "My Journey" lesson system.
-- ============================================================

-- ============================================================
-- 1. JOURNEY STEPS TABLE
-- Each step is a full interactive lesson with video, quiz,
-- game, commitment, tasks, habits, and research references.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.journey_steps (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id         UUID REFERENCES public.courses(id) ON DELETE CASCADE,
  title             TEXT NOT NULL,
  description       TEXT,
  step_number       INTEGER NOT NULL DEFAULT 1,
  is_published      BOOLEAN DEFAULT FALSE,

  -- Video
  video_provider    TEXT CHECK (video_provider IN ('heygen', 'bunny', 'youtube', 'vimeo', 'custom')),
  video_external_id TEXT,
  video_external_url TEXT,
  video_title       TEXT,

  -- Content
  summary_text      TEXT,
  text_content      TEXT,
  duration_minutes  INTEGER,

  -- Structured JSONB data
  quiz_questions    JSONB DEFAULT '[]',
  game_items        JSONB DEFAULT '[]',
  commitment        JSONB,
  researches        JSONB DEFAULT '[]',
  tasks             JSONB DEFAULT '[]',
  habits            JSONB DEFAULT '[]',

  -- Downloads
  pdf_url           TEXT,
  pdf_name          TEXT,

  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_journey_steps_course ON public.journey_steps (course_id);
CREATE INDEX IF NOT EXISTS idx_journey_steps_number ON public.journey_steps (step_number);
CREATE INDEX IF NOT EXISTS idx_journey_steps_published ON public.journey_steps (is_published);

-- ============================================================
-- 2. JOURNEY PROGRESS TABLE
-- Tracks user progress through each journey step section.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.journey_progress (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  step_id             UUID NOT NULL REFERENCES public.journey_steps(id) ON DELETE CASCADE,

  video_watched       BOOLEAN DEFAULT FALSE,
  quiz_answers        JSONB DEFAULT '{}',
  quiz_score          INTEGER,
  game_answers        JSONB DEFAULT '{}',
  game_score          INTEGER,
  commitment_accepted BOOLEAN DEFAULT FALSE,
  tasks_completed     JSONB DEFAULT '{}',
  habits_progress     JSONB DEFAULT '{}',
  is_completed        BOOLEAN DEFAULT FALSE,
  completed_at        TIMESTAMPTZ,
  last_section        TEXT DEFAULT 'video' CHECK (last_section IN ('video', 'quiz', 'game', 'commitment', 'summary')),

  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, step_id)
);

CREATE INDEX IF NOT EXISTS idx_journey_progress_user ON public.journey_progress (user_id);
CREATE INDEX IF NOT EXISTS idx_journey_progress_step ON public.journey_progress (step_id);
CREATE INDEX IF NOT EXISTS idx_journey_progress_completed ON public.journey_progress (is_completed);

-- ============================================================
-- 3. TRIGGERS
-- ============================================================
CREATE OR REPLACE TRIGGER update_journey_steps_updated_at
  BEFORE UPDATE ON public.journey_steps
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_journey_progress_updated_at
  BEFORE UPDATE ON public.journey_progress
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 4. ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE public.journey_steps    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journey_progress ENABLE ROW LEVEL SECURITY;

-- Journey steps: anyone enrolled can view published steps
CREATE POLICY "anyone_view_published_steps" ON public.journey_steps
  FOR SELECT USING (
    is_published = TRUE
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "admins_manage_steps" ON public.journey_steps
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Journey progress: users manage their own
CREATE POLICY "users_own_journey_progress" ON public.journey_progress
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "admins_view_journey_progress" ON public.journey_progress
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );
