-- perf(cpu): event-driven Ops alerts instead of polling Vercel.
-- AFTER triggers push an EMPTY "changed" ping on a PRIVATE Realtime broadcast topic; the browser
-- then does one normal, fully-authorized API fetch. No row data ever travels over Realtime.
-- Topics:  ops-login:<user_id>   (only that user may listen)
--          gideon-identities     (only public.is_admin() may listen)
--          ops-admin-notify      (only public.is_admin() may listen; new admin bell items)
-- realtime.messages had RLS on and NO policies (every private channel denied); we add SELECT only.
-- Additive schema change, no data touched. Rollback:
--   drop trigger if exists zz_rt_ping on public.ops_login_requests;
--   drop trigger if exists zz_rt_ping on public.gideon_telegram_identities;
--   drop trigger if exists zz_rt_ping on public.ops_admin_notifications;
--   drop function if exists public.ops_rt_ping();
--   drop policy if exists ops_rt_ping_listen on realtime.messages;

create or replace function public.ops_rt_ping() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare topic text;
begin
  if tg_table_name = 'ops_login_requests' then
    topic := 'ops-login:' || coalesce(new.user_id, old.user_id)::text;
  elsif tg_table_name = 'ops_admin_notifications' then
    topic := 'ops-admin-notify';
  else
    topic := 'gideon-identities';
  end if;
  begin
    perform realtime.send('{}'::jsonb, 'changed', topic, true);
  exception when others then null; -- never break the login / identity flow over a ping
  end;
  return null;
end $$;
revoke all on function public.ops_rt_ping() from public, anon, authenticated;

drop trigger if exists zz_rt_ping on public.ops_login_requests;
create trigger zz_rt_ping after insert or update of status on public.ops_login_requests
  for each row execute function public.ops_rt_ping();

drop trigger if exists zz_rt_ping on public.gideon_telegram_identities;
create trigger zz_rt_ping after insert or update or delete on public.gideon_telegram_identities
  for each row execute function public.ops_rt_ping();

drop trigger if exists zz_rt_ping on public.ops_admin_notifications;
create trigger zz_rt_ping after insert on public.ops_admin_notifications
  for each row execute function public.ops_rt_ping();

drop policy if exists ops_rt_ping_listen on realtime.messages;
create policy ops_rt_ping_listen on realtime.messages for select to authenticated using (
  realtime.messages.extension = 'broadcast' and (
    realtime.topic() = 'ops-login:' || (select auth.uid())::text
    or (realtime.topic() in ('gideon-identities', 'ops-admin-notify') and (select public.is_admin()))
  )
);
