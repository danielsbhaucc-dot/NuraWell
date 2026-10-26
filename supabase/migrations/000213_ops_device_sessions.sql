-- Bind Supabase sessions to the Ops trusted device they entered through, so revoking a device ends its sessions.
create table if not exists public.ops_device_sessions (
  device_id uuid not null references public.ops_trusted_devices(id) on delete cascade,
  session_id uuid not null,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (device_id, session_id)
);
alter table public.ops_device_sessions enable row level security;
revoke all on public.ops_device_sessions from public, anon, authenticated;

create or replace function public.ops_revoke_device_sessions(p_device uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare n int; begin
  delete from auth.sessions s using public.ops_device_sessions d
   where d.device_id = p_device and s.id = d.session_id and s.user_id = d.user_id;
  get diagnostics n = row_count;
  delete from public.ops_device_sessions where device_id = p_device;
  return n;
end $$;
revoke all on function public.ops_revoke_device_sessions(uuid) from public, anon, authenticated;
grant execute on function public.ops_revoke_device_sessions(uuid) to service_role;
