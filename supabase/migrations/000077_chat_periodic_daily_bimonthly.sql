-- הרחבת סוגי סיכום שיחות: daily + bi_monthly
ALTER TABLE public.chat_periodic_summaries
  DROP CONSTRAINT IF EXISTS chat_periodic_summaries_type_check;

ALTER TABLE public.chat_periodic_summaries
  ADD CONSTRAINT chat_periodic_summaries_type_check CHECK (type IN (
    'daily',
    'weekly',
    'monthly',
    'bi_monthly',
    'quarterly',
    'semi_annual',
    'annual'
  ));

COMMENT ON TABLE public.chat_periodic_summaries IS
  'סיכומים תקופתיים של שיחות אלמוג — פירמידה daily..annual.';
