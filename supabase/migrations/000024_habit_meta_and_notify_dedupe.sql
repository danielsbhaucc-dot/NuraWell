-- ============================================================
-- NuraWell — Habit meta + notification dedupe
-- Migration: 000024_habit_meta_and_notify_dedupe.sql
-- ============================================================

-- מטא-דאטה להרגלים: יעד ימים, streak, הושג, הארכות/קיצורים
ALTER TABLE public.journey_progress
  ADD COLUMN IF NOT EXISTS habit_meta JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.journey_progress.habit_meta IS
  'Per-habit tracking: { habitId: { target_days, streak_current, streak_best, achieved_at, extended_by } }';

-- מניעת כפילות התראות habit-checkpoint לאותו user+date+slot
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_habit_checkpoint_dedupe
  ON public.notifications (
    user_id,
    ((metadata ->> 'checkpoint_date')),
    ((metadata ->> 'slot'))
  )
  WHERE type = 'ai_message'
    AND (metadata ->> 'source') = 'almog_habit_checkpoint';
