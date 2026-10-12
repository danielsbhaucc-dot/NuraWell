-- קטגוריית שיחה שנבחרת ע"י מודל זול יחד עם הכותרת (במקום ניחוש regex בצד לקוח).
ALTER TABLE public.chat_sessions ADD COLUMN IF NOT EXISTS topic text
  CHECK (topic IS NULL OR topic IN ('habits','emotions','nutrition','sleep','journey','general'));
