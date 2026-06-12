-- ============================================================
-- NuraWell — Realtime for Almog commitments
-- Migration: 000049_almog_commitments_realtime.sql
--
-- מאפשר עדכון חי (live) בעמוד "התוכנית שלי": כשמשהו משתנה (אלמוג נתן משימה,
-- תזכורת נשלחה, חסם התעדכן, פוקוס הופעל) — העמוד מתעדכן מיד בלי רענון.
-- אחרי migrate ודאו ב-Supabase Dashboard > Database > Publications שהטבלאות
-- מופיעות תחת supabase_realtime.
-- ============================================================

DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'almog_assignments',
    'scheduled_reminders',
    'almog_focus_periods',
    'almog_blockers'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
