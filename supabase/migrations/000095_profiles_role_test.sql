-- 000095: allow role 'test' for dedicated e2e accounts (excluded from cron counts, notifications and business metrics)
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role = any (array['user','admin','test']));
