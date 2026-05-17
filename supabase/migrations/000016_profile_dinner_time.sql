-- שעת ארוחת ערב (אופציונלי) — לתזמון מגע לפני/אחרי
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS dinner_time TIME;

COMMENT ON COLUMN public.profiles.dinner_time IS 'שעת ארוחת ערב טיפוסית — לבדיקות אלמוג לפני ואחרי';
