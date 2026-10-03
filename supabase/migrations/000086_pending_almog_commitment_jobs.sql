-- תור עמיד לחילוץ התחייבויות אלמוג — לא חוסם את סגירת stream הצ׳אט.
-- העיבוד (LLM + persist) רץ ברקע / cron עם retry.

CREATE TABLE IF NOT EXISTS public.pending_almog_commitment_jobs (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_id           UUID,
  user_message         TEXT NOT NULL,
  assistant_message    TEXT NOT NULL,
  rolling_summary      TEXT,
  habit_titles         JSONB NOT NULL DEFAULT '[]'::jsonb,
  habit_title_to_id    JSONB NOT NULL DEFAULT '{}'::jsonb,
  related_step_id      TEXT,
  attempts             INT NOT NULL DEFAULT 0,
  max_attempts         INT NOT NULL DEFAULT 5,
  processed            BOOLEAN NOT NULL DEFAULT FALSE,
  processed_at         TIMESTAMPTZ,
  last_error           TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.pending_almog_commitment_jobs IS
  'תור לחילוץ/שמירת התחייבויות אלמוג אחרי תשובת צ׳אט — עמיד ל-retry, לא על critical path של ה-stream.';

CREATE INDEX IF NOT EXISTS idx_pending_almog_commitment_jobs_unprocessed
  ON public.pending_almog_commitment_jobs (created_at ASC)
  WHERE processed = FALSE;

CREATE INDEX IF NOT EXISTS idx_pending_almog_commitment_jobs_user
  ON public.pending_almog_commitment_jobs (user_id, created_at DESC);

ALTER TABLE public.pending_almog_commitment_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pending_almog_commitment_jobs_service_role_all
  ON public.pending_almog_commitment_jobs;
CREATE POLICY pending_almog_commitment_jobs_service_role_all
  ON public.pending_almog_commitment_jobs FOR ALL TO service_role
  USING (TRUE) WITH CHECK (TRUE);
