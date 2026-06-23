-- זמני יום מותאמים אישית — סלוטי בוקר/צהריים/ערב וסלוטים מותאמים
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS daily_rhythm JSONB;

COMMENT ON COLUMN public.profiles.daily_rhythm IS
  'זמנים מותאמים: { morning, noon, evening, custom_slots: { "slot_1": "10:00" } } — משמש לבחירת משימה חכמה והתראות';
