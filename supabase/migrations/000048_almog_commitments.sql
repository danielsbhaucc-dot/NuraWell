-- ============================================================
-- NuraWell — Almog Actionable Commitments
-- Migration: 000048_almog_commitments.sql
--
-- הופך את אלמוג ממנטור שמדבר למנטור שמבצע. כל הבטחה/משימה/תזכורת/הקפאה
-- שאלמוג מסכם עם המשתמש נרשמת כאן בצורה מובנית ומתבצעת בפועל:
--   • almog_assignments    — משימות אישיות שאלמוג נתן (עם "למה", מעקב ותיעוד)
--   • scheduled_reminders  — תור תזכורות אמיתיות שה-CRON מרוקן
--   • almog_focus_periods  — "מצב פוקוס" כשמקפיאים משימות רגילות זמנית
--   • almog_blockers       — חסמים שאלמוג מזהה ועוקב אחריהם עד שנפתרים
--
-- כתיבה רק דרך service role (admin client) / API מאומת. ל-authenticated יש
-- SELECT על השורות שלו בלבד (RLS), כדי שהמשתמש יראה את מה שאלמוג נתן לו.
-- ============================================================

-- ------------------------------------------------------------
-- 1) almog_assignments — משימות אישיות מאלמוג
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.almog_assignments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title              TEXT NOT NULL,
  -- ה"למה" מאחורי המשימה — מוצג גם למשתמש, וגם מזכיר לאלמוג למה הוא נתן אותה.
  reason             TEXT,
  -- מידע נוסף/המשך רלוונטי (אופציונלי).
  detail             TEXT,
  status             TEXT NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active', 'completed', 'dropped', 'frozen')),
  schedule           TEXT NOT NULL DEFAULT 'one_time'
                       CHECK (schedule IN ('one_time', 'daily', 'weekly')),
  given_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  due_at             TIMESTAMPTZ,
  -- קישור להרגל/צעד הישן שהמשימה האישית נועדה "להציל" — מאפשר לאלמוג להמשיך
  -- לעקוב אחרי ההרגל הישן גם כשהמשתמש מתמקד במשימה החדשה.
  related_habit_id   TEXT,
  related_step_id    UUID REFERENCES public.journey_steps(id) ON DELETE SET NULL,
  source_session_id  UUID,
  source_excerpt     TEXT,
  last_done_at       TIMESTAMPTZ,
  done_count         INTEGER NOT NULL DEFAULT 0,
  -- לוג תיעוד קצר: [{ at, action: 'done'|'dropped'|'reactivated', note }]
  history            JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- מפתח למניעת כפילויות חילוץ (hash מנורמל של הכותרת לכל משתמש).
  dedupe_key         TEXT,
  created_by         TEXT NOT NULL DEFAULT 'almog',
  metadata           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.almog_assignments IS
  'Personalized tasks Almog assigned in chat — title, why, tracking and documentation. Created by background extractor (Llama 4).';

CREATE INDEX IF NOT EXISTS idx_almog_assignments_user_status
  ON public.almog_assignments (user_id, status, given_at DESC);

-- מניעת כפילויות: אותו משתמש + אותו dedupe_key לא ייווצר פעמיים.
CREATE UNIQUE INDEX IF NOT EXISTS uq_almog_assignments_dedupe
  ON public.almog_assignments (user_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

-- ------------------------------------------------------------
-- 2) scheduled_reminders — תור תזכורות אמיתיות (ה-CRON מרוקן)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.scheduled_reminders (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  fire_at            TIMESTAMPTZ NOT NULL,
  kind               TEXT NOT NULL DEFAULT 'reminder'
                       CHECK (kind IN ('reminder', 'followup', 'check_progress')),
  title              TEXT NOT NULL,
  body               TEXT NOT NULL,
  assignment_id      UUID REFERENCES public.almog_assignments(id) ON DELETE CASCADE,
  blocker_id         UUID,
  status             TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'sent', 'cancelled', 'skipped')),
  dedupe_key         TEXT,
  source_session_id  UUID,
  notification_id    UUID,
  metadata           JSONB NOT NULL DEFAULT '{}'::jsonb,
  sent_at            TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.scheduled_reminders IS
  'Real reminders Almog committed to — drained twice an hour by the almog-reminders CRON into notifications + Web Push.';

-- האינדקס המרכזי שה-CRON שואב לפיו: status=pending AND fire_at <= now().
CREATE INDEX IF NOT EXISTS idx_scheduled_reminders_due
  ON public.scheduled_reminders (status, fire_at);

CREATE INDEX IF NOT EXISTS idx_scheduled_reminders_user
  ON public.scheduled_reminders (user_id, status, fire_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_scheduled_reminders_dedupe
  ON public.scheduled_reminders (user_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

-- ------------------------------------------------------------
-- 3) almog_focus_periods — מצב פוקוס (הקפאת משימות רגילות זמנית)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.almog_focus_periods (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status             TEXT NOT NULL DEFAULT 'proposed'
                       CHECK (status IN ('proposed', 'active', 'ended', 'declined')),
  reason             TEXT,
  -- 'reminders' = רק עוצרים תזכורות על משימות רגילות (ברירת מחדל הבטוחה).
  -- 'reminders_and_dim' = גם מציגים אותן מעומעמות ב-UI (בהסכמת המשתמש).
  paused_scope       TEXT NOT NULL DEFAULT 'reminders'
                       CHECK (paused_scope IN ('reminders', 'reminders_and_dim')),
  -- מזהי המשימות האישיות שעליהן מתמקדים בתקופה הזו.
  assignment_ids     JSONB NOT NULL DEFAULT '[]'::jsonb,
  started_at         TIMESTAMPTZ,
  ends_at            TIMESTAMPTZ,
  user_confirmed     BOOLEAN NOT NULL DEFAULT FALSE,
  source_session_id  UUID,
  metadata           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.almog_focus_periods IS
  'Almog focus/freeze periods — pauses regular task reminders so the user can focus on Almog assignments. Default never deletes/hides; habit tracking continues in background.';

-- שאילתה תכופה: תקופת פוקוס חיה (proposed/active) פר-משתמש.
CREATE INDEX IF NOT EXISTS idx_almog_focus_periods_live
  ON public.almog_focus_periods (user_id, status, updated_at DESC);

-- ------------------------------------------------------------
-- 4) almog_blockers — חסמים שאלמוג מזהה ועוקב אחריהם
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.almog_blockers (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  description           TEXT NOT NULL,
  -- האסטרטגיה שאלמוג הציע כדי להתגבר על החסם.
  strategy              TEXT,
  status                TEXT NOT NULL DEFAULT 'open'
                          CHECK (status IN ('open', 'improving', 'resolved')),
  identified_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_checked_at       TIMESTAMPTZ,
  next_check_at         TIMESTAMPTZ,
  related_assignment_id UUID REFERENCES public.almog_assignments(id) ON DELETE SET NULL,
  dedupe_key            TEXT,
  -- לוג מעקב: [{ at, status, note }]
  history               JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata              JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.almog_blockers IS
  'Obstacles Almog identified and is tracking over time — with a strategy and scheduled progress checks (next_check_at).';

CREATE INDEX IF NOT EXISTS idx_almog_blockers_user_status
  ON public.almog_blockers (user_id, status, identified_at DESC);

CREATE INDEX IF NOT EXISTS idx_almog_blockers_next_check
  ON public.almog_blockers (status, next_check_at);

CREATE UNIQUE INDEX IF NOT EXISTS uq_almog_blockers_dedupe
  ON public.almog_blockers (user_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

-- ============================================================
-- RLS — המשתמש קורא רק את השורות שלו. כתיבה רק דרך service role / API מאומת.
-- ============================================================
ALTER TABLE public.almog_assignments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.almog_focus_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.almog_blockers      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS almog_assignments_select_own ON public.almog_assignments;
CREATE POLICY almog_assignments_select_own
  ON public.almog_assignments FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS scheduled_reminders_select_own ON public.scheduled_reminders;
CREATE POLICY scheduled_reminders_select_own
  ON public.scheduled_reminders FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS almog_focus_periods_select_own ON public.almog_focus_periods;
CREATE POLICY almog_focus_periods_select_own
  ON public.almog_focus_periods FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS almog_blockers_select_own ON public.almog_blockers;
CREATE POLICY almog_blockers_select_own
  ON public.almog_blockers FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================
-- updated_at triggers
-- ============================================================
CREATE OR REPLACE FUNCTION public.touch_almog_commitments_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_almog_assignments_updated_at ON public.almog_assignments;
CREATE TRIGGER trg_almog_assignments_updated_at
  BEFORE UPDATE ON public.almog_assignments
  FOR EACH ROW EXECUTE FUNCTION public.touch_almog_commitments_updated_at();

DROP TRIGGER IF EXISTS trg_scheduled_reminders_updated_at ON public.scheduled_reminders;
CREATE TRIGGER trg_scheduled_reminders_updated_at
  BEFORE UPDATE ON public.scheduled_reminders
  FOR EACH ROW EXECUTE FUNCTION public.touch_almog_commitments_updated_at();

DROP TRIGGER IF EXISTS trg_almog_focus_periods_updated_at ON public.almog_focus_periods;
CREATE TRIGGER trg_almog_focus_periods_updated_at
  BEFORE UPDATE ON public.almog_focus_periods
  FOR EACH ROW EXECUTE FUNCTION public.touch_almog_commitments_updated_at();

DROP TRIGGER IF EXISTS trg_almog_blockers_updated_at ON public.almog_blockers;
CREATE TRIGGER trg_almog_blockers_updated_at
  BEFORE UPDATE ON public.almog_blockers
  FOR EACH ROW EXECUTE FUNCTION public.touch_almog_commitments_updated_at();
