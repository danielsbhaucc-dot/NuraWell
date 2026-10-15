-- Default demo target account, chosen in Ops → demo access; used by the Ops form and by Gideon's create_demo_link.
alter table public.site_settings
  add column if not exists demo_default_target_user_id uuid references public.profiles(id) on delete set null;

-- Seed with the account the dashboard used most recently (changeable in Ops).
update public.site_settings s
   set demo_default_target_user_id = (select target_user_id from public.demo_access_links order by created_at desc limit 1)
 where s.id = 1 and s.demo_default_target_user_id is null;
