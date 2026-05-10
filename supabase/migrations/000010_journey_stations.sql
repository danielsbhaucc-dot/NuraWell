-- תחנות במסע: קיבוץ לוגי של צעדים (ללא הגבלת כמות תחנות או צעדים לתחנה).

CREATE TABLE IF NOT EXISTS public.journey_stations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  description TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_journey_stations_sort ON public.journey_stations (sort_order);

ALTER TABLE public.journey_steps
  ADD COLUMN IF NOT EXISTS station_id UUID REFERENCES public.journey_stations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_journey_steps_station ON public.journey_steps (station_id);

CREATE OR REPLACE TRIGGER update_journey_stations_updated_at
  BEFORE UPDATE ON public.journey_stations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.journey_stations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone_view_journey_stations"
  ON public.journey_stations FOR SELECT
  USING (TRUE);

CREATE POLICY "admins_manage_journey_stations"
  ON public.journey_stations FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );
