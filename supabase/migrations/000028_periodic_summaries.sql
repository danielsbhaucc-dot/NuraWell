-- ============================================================
-- NuraWell — Periodic Summary Engine ("Memory Pyramid")
-- Migration: 000028_periodic_summaries.sql
-- Description:
--   טבלה אחת שמכילה את כל הסיכומים התקופתיים ב-6 רמות:
--   daily → weekly → monthly → quarterly → semi_annual → annual.
--
--   האסטרטגיה ("Memory Pyramid"):
--     • Daily   – נקרא ישירות מ-task_logs.
--     • Weekly  – נקרא רק את 7 ה-Daily summaries של אותו שבוע.
--     • Monthly – נקרא רק את ה-Weekly summaries של אותו חודש (~4).
--     • Quarterly  – 3 Months.
--     • Semi-Annual – 2 Quarters.
--     • Annual      – 2 Semi-Annuals.
--
--   ה-DB מאחסן:
--     • metrics    – חישובים דטרמיניסטיים (completion_rate, streak,
--                    missed_days, weakest_day…), נסכמים בקוד / SQL.
--     • ai_insight – הטקסט האמפתי שה-LLM מפיק (gpt-5-mini דרך OpenRouter).
--
--   ה-UNIQUE על (user_id, type, period_key) מאפשר UPSERT אידמפוטנטי
--   כך ש-cron שירוץ פעמיים על אותה תקופה לא ייצור כפילויות.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.periodic_summaries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- רמת הסיכום בתוך פירמידת הזיכרון.
  type        TEXT NOT NULL CHECK (type IN (
    'daily',
    'weekly',
    'monthly',
    'quarterly',
    'semi_annual',
    'annual'
  )),
  -- מפתח התקופה הקנוני (קצר, ניתן ל-sort לקסיקוגרפי בתוך כל type):
  --   daily       → 'YYYY-MM-DD'  (e.g. 2026-05-29)
  --   weekly      → 'YYYY-Www'    (e.g. 2026-W22) — ISO week
  --   monthly     → 'YYYY-Mmm'    (e.g. 2026-M05)
  --   quarterly   → 'YYYY-Qq'     (e.g. 2026-Q2)
  --   semi_annual → 'YYYY-Hh'     (e.g. 2026-H1)
  --   annual      → 'YYYY'        (e.g. 2026)
  period_key  TEXT NOT NULL,
  -- מתמטיקה דטרמיניסטית — JSONB גמיש, אבל מצופה לכלול לפחות:
  --   completion_rate (0..1), streak (int), missed_days (int),
  --   weakest_day (text, e.g. "Sunday"). שאר השדות תלויים ב-type.
  metrics     JSONB NOT NULL DEFAULT '{}'::jsonb,
  ai_insight  TEXT NOT NULL DEFAULT '',
  ai_model    TEXT NOT NULL DEFAULT 'openai/gpt-5-mini',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (user_id, type, period_key)
);

-- אינדקס מהיר לדף "ההתקדמות שלי" — לפי משתמש + תקופה אחרונה.
CREATE INDEX IF NOT EXISTS idx_periodic_summaries_user_type_period
  ON public.periodic_summaries (user_id, type, period_key DESC);

-- אינדקס נוסף לאדמין — לסקור גלובלית מה נוצר לאחרונה.
CREATE INDEX IF NOT EXISTS idx_periodic_summaries_created
  ON public.periodic_summaries (created_at DESC);

-- updated_at אוטומטי
CREATE OR REPLACE FUNCTION public.set_periodic_summaries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_periodic_summaries_updated_at ON public.periodic_summaries;
CREATE TRIGGER trg_periodic_summaries_updated_at
  BEFORE UPDATE ON public.periodic_summaries
  FOR EACH ROW EXECUTE FUNCTION public.set_periodic_summaries_updated_at();

-- ============================================================
-- RLS — משתמשים רואים רק את עצמם, אדמינים רואים הכל
-- ============================================================
ALTER TABLE public.periodic_summaries ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'periodic_summaries'
      AND policyname = 'users_view_own_periodic_summaries'
  ) THEN
    CREATE POLICY "users_view_own_periodic_summaries"
      ON public.periodic_summaries
      FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- אדמינים יכולים גם לקרוא וגם לעשות UPSERT/DELETE מתוך פאנל ה-Ops.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'periodic_summaries'
      AND policyname = 'admins_manage_periodic_summaries'
  ) THEN
    CREATE POLICY "admins_manage_periodic_summaries"
      ON public.periodic_summaries
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
  END IF;
END $$;

-- service_role עוקף RLS אוטומטית, ולכן ה-API routes שמשתמשים ב-Admin client
-- (createAdminClient) ימשיכו לבצע UPSERT אחרי שה-cascade הסתיים.

COMMENT ON TABLE  public.periodic_summaries          IS 'NuraWell Memory Pyramid — סיכומים תקופתיים מצרפיים (daily..annual).';
COMMENT ON COLUMN public.periodic_summaries.type     IS 'רמת הסיכום: daily | weekly | monthly | quarterly | semi_annual | annual.';
COMMENT ON COLUMN public.periodic_summaries.period_key IS 'מפתח קנוני של התקופה: 2026-05-29 / 2026-W22 / 2026-M05 / 2026-Q2 / 2026-H1 / 2026.';
COMMENT ON COLUMN public.periodic_summaries.metrics  IS 'מתמטיקה דטרמיניסטית (completion_rate, streak, missed_days, weakest_day וכו'').';
COMMENT ON COLUMN public.periodic_summaries.ai_insight IS 'תובנת ה-LLM האמפתית (gpt-5-mini), נכתבת על בסיס מטריקות + סיכומי הרמה הנמוכה.';
