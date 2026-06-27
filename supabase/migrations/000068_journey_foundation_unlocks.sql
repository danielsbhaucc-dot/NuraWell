-- תחנת חובה (foundation) + שחרור צעדי קטלוג per-user (adaptive)

ALTER TABLE public.journey_stations
  ADD COLUMN IF NOT EXISTS is_foundation BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.journey_stations.is_foundation IS
  'תחנת חובה — כל המשתמשים עוברים לינארית; רק תחנה אחת פעילה';

CREATE UNIQUE INDEX IF NOT EXISTS uq_journey_stations_one_foundation
  ON public.journey_stations ((true))
  WHERE is_foundation = true;

CREATE TABLE IF NOT EXISTS public.user_journey_step_unlocks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  step_id     UUID NOT NULL REFERENCES public.journey_steps(id) ON DELETE CASCADE,
  source      TEXT NOT NULL CHECK (source IN ('foundation', 'adaptive')),
  reason      TEXT,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, step_id)
);

CREATE INDEX IF NOT EXISTS idx_user_journey_unlocks_user
  ON public.user_journey_step_unlocks (user_id, unlocked_at DESC);

COMMENT ON TABLE public.user_journey_step_unlocks IS
  'צעדי קטלוג (לא foundation) שנפתחו למשתמש — adaptive personalization';

ALTER TABLE public.user_journey_step_unlocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_view_own_journey_unlocks"
  ON public.user_journey_step_unlocks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "admins_manage_journey_unlocks"
  ON public.user_journey_step_unlocks FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );
