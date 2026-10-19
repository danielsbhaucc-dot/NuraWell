-- Ops new-device approval: trusted devices, pending login approvals, one-time recovery codes.
-- Server-only tables (service role). Only hashes of device secrets / codes are stored.

create table if not exists public.ops_trusted_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  secret_hash text not null,
  label text not null default '',
  via text not null default 'approval',
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  -- Ops-host cookie minted from a main-site trusted device by handoff; revoking the parent revokes it
  parent_id uuid references public.ops_trusted_devices(id) on delete cascade
);
create index if not exists idx_ops_trusted_devices_user on public.ops_trusted_devices(user_id) where revoked_at is null;

create table if not exists public.ops_login_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pending_hash text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied', 'expired', 'consumed')),
  label text not null default '',
  location text not null default '',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  decided_at timestamptz,
  decided_via text,
  recovery_failures int not null default 0,
  -- email approval (code + link): hashes only, 10 min, single use, 5 attempts
  email_code_hash text,
  email_token_hash text,
  email_expires_at timestamptz,
  email_attempts int not null default 0
);
create index if not exists idx_ops_login_requests_user on public.ops_login_requests(user_id, created_at desc);

create table if not exists public.ops_recovery_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null,
  created_at timestamptz not null default now(),
  used_at timestamptz
);
create index if not exists idx_ops_recovery_codes_user on public.ops_recovery_codes(user_id) where used_at is null;

create table if not exists public.ops_security_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  recovery_failures int not null default 0,
  recovery_locked_until timestamptz,
  codes_pending_display boolean not null default false,
  updated_at timestamptz not null default now()
);

-- Rollout moment: sessions created before it may bootstrap the first trusted device.
create table if not exists public.ops_device_policy (
  id boolean primary key default true check (id),
  enforce_from timestamptz not null default now()
);
insert into public.ops_device_policy (id) values (true) on conflict do nothing;

-- One-time handoff main site → Ops host (60 s, single use, bound to user + trusted device + client).
create table if not exists public.ops_handoff_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid not null references public.ops_trusted_devices(id) on delete cascade,
  token_hash text not null,
  client_hash text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

-- The old bridge stored raw access/refresh tokens (plaintext, 120 s). Replaced by ops_handoff_tokens.
drop function if exists public.insert_ops_auth_ticket(text, text, timestamptz);
drop function if exists public.claim_ops_auth_ticket(uuid);
drop table if exists public.ops_auth_tickets;

-- Security events that must reach Daniel (Telegram + email), e.g. break-glass. Dispatched by the app.
create table if not exists public.ops_security_events (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now(),
  alerted_at timestamptz
);

do $$ declare t text; begin
  foreach t in array array['ops_handoff_tokens','ops_security_events','ops_trusted_devices','ops_login_requests','ops_recovery_codes','ops_security_state','ops_device_policy'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- Session facts for the gate (created_at of the caller's session) + "זה לא אני" revoke-all.
create or replace function public.ops_session_created_at(p_session uuid, p_user uuid)
returns timestamptz language sql security definer set search_path = '' stable as $$
  select created_at from auth.sessions where id = p_session and user_id = p_user
$$;
create or replace function public.ops_revoke_user_sessions(p_user uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare n int; begin
  delete from auth.sessions where user_id = p_user;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.ops_session_created_at(uuid, uuid) from public, anon, authenticated;
revoke all on function public.ops_revoke_user_sessions(uuid) from public, anon, authenticated;
grant execute on function public.ops_session_created_at(uuid, uuid) to service_role;
grant execute on function public.ops_revoke_user_sessions(uuid) to service_role;

-- Recovery codes are hashed with bcrypt (pgcrypto) so the break-glass SQL below can issue codes too.
create or replace function public.ops_set_recovery_codes(p_user uuid, p_codes text[])
returns int language plpgsql security definer set search_path = '' as $$
declare c text; n int := 0; begin
  delete from public.ops_recovery_codes where user_id = p_user;
  foreach c in array p_codes loop
    insert into public.ops_recovery_codes (user_id, code_hash)
      values (p_user, extensions.crypt(upper(regexp_replace(c, '[^A-Za-z0-9]', '', 'g')), extensions.gen_salt('bf', 10)));
    n := n + 1;
  end loop;
  return n;
end $$;

-- Atomically consume one matching unused code. Returns true on success.
create or replace function public.ops_use_recovery_code(p_user uuid, p_code text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')); hit uuid; begin
  if length(v) <> 10 then return false; end if;
  select id into hit from public.ops_recovery_codes
    where user_id = p_user and used_at is null and code_hash = extensions.crypt(v, code_hash)
    limit 1 for update skip locked;
  if hit is null then return false; end if;
  update public.ops_recovery_codes set used_at = now() where id = hit and used_at is null;
  return found;
end $$;

-- BREAK-GLASS (self-service for Daniel, Supabase dashboard → SQL editor, runs as postgres):
--   select * from public.ops_break_glass_reset();
-- Revokes trusted devices, recovery codes, pending approvals and ALL sessions of the owner, issues 10
-- fresh recovery codes (shown once, in the SQL result only), audit-logs and queues a Telegram + email alert.
create or replace function public.ops_break_glass_reset(owner uuid default null)
returns table (recovery_code text) language plpgsql security definer set search_path = '' as $$
declare u uuid := owner; d int; s int; codes text[] := '{}'; raw text; alpha text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; i int; j int; begin
  if u is null then
    select p.id into u from public.profiles p where p.role = 'admin';
    if (select count(*) from public.profiles where role = 'admin') <> 1 then
      raise exception 'more than one admin: pass the owner uuid';
    end if;
  end if;
  if not exists (select 1 from public.profiles where id = u and role = 'admin') then raise exception 'not an admin'; end if;
  update public.ops_trusted_devices set revoked_at = now() where user_id = u and revoked_at is null;
  get diagnostics d = row_count;
  update public.ops_login_requests set status = 'expired' where user_id = u and status in ('pending', 'approved');
  delete from public.ops_handoff_tokens where user_id = u;
  delete from public.ops_security_state where user_id = u;
  delete from auth.sessions where user_id = u;
  get diagnostics s = row_count;
  for i in 1..10 loop
    raw := '';
    for j in 1..10 loop
      raw := raw || substr(alpha, 1 + (get_byte(extensions.gen_random_bytes(1), 0) % 32), 1);
    end loop;
    codes := codes || (substr(raw, 1, 5) || '-' || substr(raw, 6, 5));
  end loop;
  perform public.ops_set_recovery_codes(u, codes);
  insert into public.admin_audit_log (actor_id, method, path, detail)
    values (null, 'BREAK_GLASS', 'ops_break_glass_reset', jsonb_build_object('user', u, 'devices', d, 'sessions', s, 'db_user', current_user));
  insert into public.ops_security_events (kind, detail)
    values ('break_glass', jsonb_build_object('user', u, 'devices', d, 'sessions', s));
  return query select unnest(codes);
end $$;

revoke all on function public.ops_set_recovery_codes(uuid, text[]) from public, anon, authenticated;
revoke all on function public.ops_use_recovery_code(uuid, text) from public, anon, authenticated;
grant execute on function public.ops_set_recovery_codes(uuid, text[]) to service_role;
grant execute on function public.ops_use_recovery_code(uuid, text) to service_role;
revoke all on function public.ops_break_glass_reset(uuid) from public, anon, authenticated;
grant execute on function public.ops_break_glass_reset(uuid) to service_role;

-- Gideon last-resort lockout reports
alter table public.ceo_dev_forwards drop constraint if exists ceo_dev_forwards_kind_check;
alter table public.ceo_dev_forwards add constraint ceo_dev_forwards_kind_check check (kind in ('finding', 'capability_request', 'lockout'));
