-- ארוחות יומיות מההרשמה (אופציונלי)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS meal_count SMALLINT
    CHECK (meal_count IS NULL OR (meal_count >= 0 AND meal_count <= 4)),
  ADD COLUMN IF NOT EXISTS meal_schedule JSONB;

COMMENT ON COLUMN public.profiles.meal_count IS '0=דילוג על שעות ארוחה; 1–3 ארוחות עיקריות';
COMMENT ON COLUMN public.profiles.meal_schedule IS '[{time, slot, label}] — זמני ארוחות + חלון יום';
