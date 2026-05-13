-- תמונת רקע לתחנות במסע (אחסון ב-R2 + קרדיט מ-Pixabay/Pexels).

ALTER TABLE public.journey_stations
  ADD COLUMN IF NOT EXISTS cover_image_key TEXT,
  ADD COLUMN IF NOT EXISTS cover_image_credit JSONB;

COMMENT ON COLUMN public.journey_stations.cover_image_key IS 'מפתח אובייקט בדלי תמונות R2 (למשל journey/stations/{id}.webp)';
COMMENT ON COLUMN public.journey_stations.cover_image_credit IS 'קרדיט תמונה: source, photographer, page_url';
