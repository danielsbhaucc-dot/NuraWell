-- Modularity stage 1: register the modules that own the remaining areas (app shell, reminders, journey, Gideon, site content).
-- Rows only (no user data). Idempotent. Central (platform-central) holds the on/off state; these rows keep the local registry in sync.
-- MODULES-1027-BEGIN
insert into public.iam_modules (id, name, core, depends_on) values
  ('app-shell', 'מעטפת האפליקציה', true, '{}'),
  ('reminders', 'תזכורות', false, '{agent}'),
  ('journey', 'מסע, מדריכים ואתגר', false, '{}'),
  ('gideon', 'גדעון (בוט מנכ"ל)', false, '{}'),
  ('site-content', 'תוכן האתר ומדיה', false, '{}')
on conflict (id) do nothing;
-- MODULES-1027-END
