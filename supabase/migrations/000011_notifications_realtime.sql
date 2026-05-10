-- Realtime עבור התראות — עדכון חי באפליקציה כשמתווספת שורה ל-notifications
-- אחרי migrate: ודאו ב-Supabase Dashboard > Database > Publications שהטבלה מופיעה תחת supabase_realtime

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;
