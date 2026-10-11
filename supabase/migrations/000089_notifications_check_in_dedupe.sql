-- Prevent duplicate personalized check-in notifications (workflow retries / overlapping cron ticks).
-- Created only if no historical duplicates exist (no data is deleted).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.notifications
    WHERE type = 'ai_message' AND (metadata ->> 'source') = 'almog_personalized_check_in'
    GROUP BY user_id, (metadata ->> 'checkpoint_date'), (metadata ->> 'check_in_index')
    HAVING count(*) > 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_check_in_dedupe
      ON public.notifications (
        user_id,
        ((metadata ->> 'checkpoint_date')),
        ((metadata ->> 'check_in_index'))
      )
      WHERE type = 'ai_message'
        AND (metadata ->> 'source') = 'almog_personalized_check_in';
  ELSE
    RAISE NOTICE 'idx_notifications_check_in_dedupe skipped: historical duplicates exist';
  END IF;
END $$;
