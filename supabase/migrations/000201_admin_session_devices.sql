-- 000201: bind each admin Supabase session to its enrolled device (per-device revoke), device last-seen meta, audit finding ack. Additive only.
create table if not exists public.ops_admin_sessions (
  session_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid not null references public.ops_trusted_devices(id) on delete cascade,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index if not exists idx_ops_admin_sessions_device on public.ops_admin_sessions(device_id) where revoked_at is null;
alter table public.ops_admin_sessions enable row level security;
revoke all on public.ops_admin_sessions from anon, authenticated;

alter table public.ops_trusted_devices add column if not exists meta_seen_at timestamptz;
alter table public.ops_trusted_devices add column if not exists countries_seen text[] not null default '{}';
alter table public.access_audit_findings add column if not exists acknowledged_by uuid;

-- First use binds the session to the device; later uses must match the same device and not be revoked.
create or replace function public.ops_bind_admin_session(p_user uuid, p_session uuid, p_device uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare r public.ops_admin_sessions; begin
  insert into public.ops_admin_sessions(session_id, user_id, device_id) values (p_session, p_user, p_device) on conflict (session_id) do nothing;
  select * into r from public.ops_admin_sessions where session_id = p_session;
  return r.user_id = p_user and r.device_id = p_device and r.revoked_at is null;
end $$;

-- Revoke one device's sessions only: mark bindings revoked and delete those auth sessions (refresh tokens cascade).
create or replace function public.ops_revoke_device_sessions(p_device uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare n int; begin
  update public.ops_admin_sessions set revoked_at = now() where device_id = p_device and revoked_at is null;
  delete from auth.sessions where id in (select session_id from public.ops_admin_sessions where device_id = p_device);
  get diagnostics n = row_count;
  return n;
end $$;

-- Revoke all: every binding of the user + every auth session.
create or replace function public.ops_revoke_all_admin_sessions(p_user uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare n int; begin
  update public.ops_admin_sessions set revoked_at = now() where user_id = p_user and revoked_at is null;
  delete from auth.sessions where user_id = p_user;
  get diagnostics n = row_count;
  return n;
end $$;

do $$ declare f text; begin
  foreach f in array array['ops_bind_admin_session(uuid,uuid,uuid)','ops_revoke_device_sessions(uuid)','ops_revoke_all_admin_sessions(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
