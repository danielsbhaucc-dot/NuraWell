-- ============================================================
-- NuraWell — Chat memory: per-session live file + periodic summaries
-- Migration: 000076_chat_memory_system.sql
-- ============================================================

ALTER TABLE public.chat_sessions
  ADD COLUMN IF NOT EXISTS live_conversation_file TEXT;

COMMENT ON COLUMN public.chat_sessions.live_conversation_file IS
  'קובץ שיחה חי — מתעדכן אחרי כל תור. כולל הקשר, חזרות, תאריכים.';

-- סיכומים תקופתיים לשיחות (שבוע/חודש/רבעון/חצי שנה/שנה)
CREATE TABLE IF NOT EXISTS public.chat_periodic_summaries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN (
    'weekly',
    'monthly',
    'quarterly',
    'semi_annual',
    'annual'
  )),
  period_key  TEXT NOT NULL,
  session_count INT NOT NULL DEFAULT 0,
  metrics     JSONB NOT NULL DEFAULT '{}'::jsonb,
  ai_insight  TEXT NOT NULL DEFAULT '',
  ai_model    TEXT NOT NULL DEFAULT 'meta-llama/llama-4-scout',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (user_id, type, period_key)
);

CREATE INDEX IF NOT EXISTS idx_chat_periodic_summaries_user_type_period
  ON public.chat_periodic_summaries (user_id, type, period_key DESC);

CREATE INDEX IF NOT EXISTS idx_chat_periodic_summaries_created
  ON public.chat_periodic_summaries (created_at DESC);

CREATE OR REPLACE FUNCTION public.set_chat_periodic_summaries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_chat_periodic_summaries_updated_at ON public.chat_periodic_summaries;
CREATE TRIGGER trg_chat_periodic_summaries_updated_at
  BEFORE UPDATE ON public.chat_periodic_summaries
  FOR EACH ROW EXECUTE FUNCTION public.set_chat_periodic_summaries_updated_at();

ALTER TABLE public.chat_periodic_summaries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_view_own_chat_periodic_summaries" ON public.chat_periodic_summaries;
CREATE POLICY "users_view_own_chat_periodic_summaries"
  ON public.chat_periodic_summaries
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "admins_manage_chat_periodic_summaries" ON public.chat_periodic_summaries;
CREATE POLICY "admins_manage_chat_periodic_summaries"
  ON public.chat_periodic_summaries
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

GRANT SELECT ON public.chat_periodic_summaries TO authenticated;
GRANT ALL ON public.chat_periodic_summaries TO service_role;

COMMENT ON TABLE public.chat_periodic_summaries IS
  'סיכומים תקופתיים של שיחות אלמוג — פירמידת weekly..annual.';
