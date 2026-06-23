-- ביטול daily_rhythm — זמנים נגזרים מפרופיל (השכמה/ארוחות/שינה) בלבד
ALTER TABLE public.profiles DROP COLUMN IF EXISTS daily_rhythm;
