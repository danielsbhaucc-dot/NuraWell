-- ============================================================
-- NuraWell — Challenge 14-day program (core)
-- Migration: 000069_challenge_core.sql
-- ============================================================

-- ── Bootstrap site_settings (אם 000006 לא הורצה) ───────────
CREATE TABLE IF NOT EXISTS public.site_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CONSTRAINT site_settings_single_row CHECK (id = 1),
  public_app_url TEXT NOT NULL DEFAULT 'https://nurawell.vercel.app',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.site_settings (id, public_app_url)
VALUES (1, 'https://nurawell.vercel.app')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

-- profiles.role יכול להיות TEXT או enum (admin_role) — לא משווים ל-'admin' ישירות
CREATE OR REPLACE FUNCTION public.nura_is_admin(uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = uid
      AND lower(btrim(p.role::text)) IN (
        'admin', 'administrator', 'super_admin', 'superadmin', 'owner', 'ops'
      )
  );
$$;

COMMENT ON FUNCTION public.nura_is_admin(uuid) IS
  'Admin check safe for TEXT or enum profiles.role — avoids invalid enum literal casts.';

DO $site_settings_policies$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'site_settings' AND policyname = 'site_settings_select_public'
  ) THEN
    CREATE POLICY "site_settings_select_public"
      ON public.site_settings FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'site_settings' AND policyname = 'site_settings_update_admin'
  ) THEN
    CREATE POLICY "site_settings_update_admin"
      ON public.site_settings FOR UPDATE TO authenticated
      USING (public.nura_is_admin())
      WITH CHECK (true);
  END IF;
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE 'profiles table missing — site_settings admin policy skipped; run base migrations first';
END $site_settings_policies$;

-- ── site_settings: global challenge toggle ─────────────────
ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS challenge_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.site_settings.challenge_enabled IS
  'When true, new enrollments enter the 14-day challenge flow.';

-- ── challenge_campaigns ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.challenge_campaigns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT NOT NULL UNIQUE,
  title           TEXT NOT NULL,
  duration_days   SMALLINT NOT NULL DEFAULT 14 CHECK (duration_days > 0 AND duration_days <= 90),
  is_active       BOOLEAN NOT NULL DEFAULT false,
  config          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.challenge_campaigns IS
  'Challenge campaign definitions — managed from OPS.';

-- ── challenge_enrollments ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.challenge_enrollments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  campaign_id           UUID NOT NULL REFERENCES public.challenge_campaigns(id) ON DELETE RESTRICT,
  registered_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  challenge_start_date  DATE NOT NULL,
  challenge_end_date    DATE NOT NULL,
  status                TEXT NOT NULL DEFAULT 'waiting'
                          CHECK (status IN ('waiting', 'active', 'completed', 'dropped')),
  eating_window         JSONB,
  intro_completed_at    TIMESTAMPTZ,
  interview_completed_at TIMESTAMPTZ,
  is_demo               BOOLEAN NOT NULL DEFAULT false,
  demo_scenario         TEXT CHECK (demo_scenario IS NULL OR demo_scenario IN ('waiting', 'intro', 'active')),
  demo_simulated_day    SMALLINT CHECK (demo_simulated_day IS NULL OR (demo_simulated_day >= 1 AND demo_simulated_day <= 90)),
  metadata              JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT challenge_enrollments_dates CHECK (challenge_end_date >= challenge_start_date)
);

COMMENT ON TABLE public.challenge_enrollments IS
  'User enrollment in a challenge campaign. is_demo=true only for admin preview.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_challenge_enrollment_user_campaign
  ON public.challenge_enrollments (user_id, campaign_id);

CREATE INDEX IF NOT EXISTS idx_challenge_enrollments_user_status
  ON public.challenge_enrollments (user_id, status);

CREATE INDEX IF NOT EXISTS idx_challenge_enrollments_demo
  ON public.challenge_enrollments (user_id)
  WHERE is_demo = true;

-- ── challenge_task_definitions ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.challenge_task_definitions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     UUID NOT NULL REFERENCES public.challenge_campaigns(id) ON DELETE CASCADE,
  task_key        TEXT NOT NULL,
  day_index       SMALLINT NOT NULL CHECK (day_index >= 1),
  sort_order      SMALLINT NOT NULL DEFAULT 0,
  title_he        TEXT NOT NULL,
  description_he  TEXT,
  schedule_type   TEXT NOT NULL DEFAULT 'daily'
                    CHECK (schedule_type IN ('daily', 'per_meal', 'morning', 'evening', 'once')),
  icon            TEXT,
  celebration_key TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, task_key, day_index)
);

COMMENT ON TABLE public.challenge_task_definitions IS
  'Daily challenge tasks — managed from OPS (like journey lessons).';

CREATE INDEX IF NOT EXISTS idx_challenge_tasks_campaign_day
  ON public.challenge_task_definitions (campaign_id, day_index, sort_order);

-- ── challenge_task_completions ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.challenge_task_completions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id       UUID NOT NULL REFERENCES public.challenge_enrollments(id) ON DELETE CASCADE,
  task_definition_id  UUID NOT NULL REFERENCES public.challenge_task_definitions(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  day_index           SMALLINT NOT NULL CHECK (day_index >= 1),
  slot_key            TEXT,
  completed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb
);

COMMENT ON TABLE public.challenge_task_completions IS
  'Task completion log for challenge participants.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_challenge_completion_slot
  ON public.challenge_task_completions (enrollment_id, task_definition_id, day_index, COALESCE(slot_key, ''));

CREATE INDEX IF NOT EXISTS idx_challenge_completions_enrollment_day
  ON public.challenge_task_completions (enrollment_id, day_index);

-- ── challenge_success_events ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.challenge_success_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id   UUID NOT NULL REFERENCES public.challenge_enrollments(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_type      TEXT NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT,
  detected_by     TEXT NOT NULL DEFAULT 'rule' CHECK (detected_by IN ('rule', 'ai', 'admin')),
  evidence        JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_challenge_success_enrollment
  ON public.challenge_success_events (enrollment_id, occurred_at DESC);

-- ── Guard: only admins may set is_demo ──────────────────────
CREATE OR REPLACE FUNCTION public.challenge_enrollment_guard_demo()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_demo IS DISTINCT FROM OLD.is_demo OR (TG_OP = 'INSERT' AND NEW.is_demo) THEN
    IF NEW.is_demo IS TRUE THEN
      IF auth.uid() IS NOT NULL THEN
        IF NOT public.nura_is_admin(auth.uid()) THEN
          RAISE EXCEPTION 'challenge demo enrollments require admin role';
        END IF;
      END IF;
    END IF;
  END IF;
  IF NEW.is_demo IS TRUE AND auth.uid() IS NOT NULL THEN
    IF auth.uid() <> NEW.user_id THEN
      RAISE EXCEPTION 'demo enrollment must belong to the admin user';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_challenge_enrollment_guard_demo ON public.challenge_enrollments;
CREATE TRIGGER trg_challenge_enrollment_guard_demo
  BEFORE INSERT OR UPDATE ON public.challenge_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.challenge_enrollment_guard_demo();

-- ── RLS ─────────────────────────────────────────────────────
ALTER TABLE public.challenge_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenge_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenge_task_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenge_task_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenge_success_events ENABLE ROW LEVEL SECURITY;

-- campaigns: read active for authenticated
CREATE POLICY "challenge_campaigns_select_active"
  ON public.challenge_campaigns FOR SELECT TO authenticated
  USING (is_active = true);

CREATE POLICY "challenge_campaigns_admin_all"
  ON public.challenge_campaigns FOR ALL TO authenticated
  USING (public.nura_is_admin())
  WITH CHECK (public.nura_is_admin());

-- enrollments: own rows only
CREATE POLICY "challenge_enrollments_select_own"
  ON public.challenge_enrollments FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "challenge_enrollments_update_own"
  ON public.challenge_enrollments FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND is_demo = (SELECT e.is_demo FROM public.challenge_enrollments e WHERE e.id = challenge_enrollments.id));

CREATE POLICY "challenge_enrollments_insert_admin"
  ON public.challenge_enrollments FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      is_demo = false
      OR public.nura_is_admin()
    )
  );

CREATE POLICY "challenge_enrollments_delete_own_demo"
  ON public.challenge_enrollments FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND is_demo = true);

-- task definitions: read if enrolled in campaign
CREATE POLICY "challenge_tasks_select_enrolled"
  ON public.challenge_task_definitions FOR SELECT TO authenticated
  USING (
    is_active = true
    AND EXISTS (
      SELECT 1 FROM public.challenge_enrollments e
      WHERE e.campaign_id = challenge_task_definitions.campaign_id
        AND e.user_id = auth.uid()
    )
  );

CREATE POLICY "challenge_tasks_admin_all"
  ON public.challenge_task_definitions FOR ALL TO authenticated
  USING (public.nura_is_admin())
  WITH CHECK (public.nura_is_admin());

-- completions: own rows
CREATE POLICY "challenge_completions_select_own"
  ON public.challenge_task_completions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "challenge_completions_insert_own"
  ON public.challenge_task_completions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- success events: own rows
CREATE POLICY "challenge_success_select_own"
  ON public.challenge_success_events FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ── Seed default campaign + tasks ───────────────────────────
INSERT INTO public.challenge_campaigns (slug, title, duration_days, is_active, config)
VALUES (
  '14-day-reset',
  'אתגר 14 יום — Reset',
  14,
  true,
  '{"version": 1}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET is_active = true, updated_at = NOW();

INSERT INTO public.challenge_task_definitions (campaign_id, task_key, day_index, sort_order, title_he, description_he, schedule_type, icon)
SELECT c.id, t.task_key, t.day_index, t.sort_order, t.title_he, t.description_he, t.schedule_type, t.icon
FROM public.challenge_campaigns c
CROSS JOIN (VALUES
  ('water_morning', 1, 1, '2 כוסות מים בבוקר', 'מיד אחרי ההשכמה — לפני קפה או אוכל.', 'morning', 'droplets'),
  ('water_before_meals', 1, 2, 'מים לפני כל ארוחה', 'כוס מים 15 דקות לפני כל ארוחה.', 'per_meal', 'glass-water'),
  ('eating_window', 1, 3, 'חלון אכילה 12:12', 'אוכלים רק בתוך החלון האישי שלך.', 'daily', 'clock'),
  ('walk_after_meal', 1, 4, '10 דקות תנועה אחרי ארוחה', 'הליכה קלה או תנועה נעימה.', 'per_meal', 'footprints'),
  ('clean_meal', 1, 5, 'ארוחה אחת נקייה', 'ארוחה אחת ביום בלי סוכר או פחמימה מעובדת.', 'daily', 'leaf'),
  ('protein_veg', 1, 6, 'חלבון + ירק בכל ארוחה', 'בכל ארוחה — חלבון וירק על הצלחת.', 'per_meal', 'salad'),
  ('sleep_buffer', 1, 7, '2 שעות לפני שינה', 'ארוחה אחרונה לפחות שעתיים לפני השינה.', 'evening', 'moon')
) AS t(task_key, day_index, sort_order, title_he, description_he, schedule_type, icon)
WHERE c.slug = '14-day-reset'
ON CONFLICT (campaign_id, task_key, day_index) DO NOTHING;

-- Copy tasks to days 2-14 (same daily tasks)
INSERT INTO public.challenge_task_definitions (campaign_id, task_key, day_index, sort_order, title_he, description_he, schedule_type, icon)
SELECT c.id, src.task_key, d.day_n, src.sort_order, src.title_he, src.description_he, src.schedule_type, src.icon
FROM public.challenge_campaigns c
JOIN public.challenge_task_definitions src ON src.campaign_id = c.id AND src.day_index = 1
CROSS JOIN generate_series(2, 14) AS d(day_n)
WHERE c.slug = '14-day-reset'
ON CONFLICT (campaign_id, task_key, day_index) DO NOTHING;

UPDATE public.site_settings SET challenge_enabled = true WHERE id = 1;
