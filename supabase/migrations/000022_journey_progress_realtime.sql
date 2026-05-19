-- עדכון לייב של התקדמות במסע (מסכי משימות / צעדים)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'journey_progress'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.journey_progress;
  END IF;
END $$;
