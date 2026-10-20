-- Passkeys (WebAuthn) + one-time backup codes for user sign-in.
-- All tables are service-role only: RLS on, no policies, no grants to anon/authenticated.
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.webauthn_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  credential_id text not null unique,          -- base64url
  public_key text not null,                    -- base64url COSE key
  counter bigint not null default 0,
  transports text[] not null default '{}',
  device_type text not null default 'singleDevice',
  backed_up boolean not null default false,
  rp_id text not null,
  label text not null default 'מפתח גישה',
  ops_device_id uuid null,                     -- trusted Ops device present at registration (admins), informational only
  created_at timestamptz not null default now(),
  last_used_at timestamptz null,
  revoked_at timestamptz null
);
create index if not exists webauthn_credentials_user_idx on public.webauthn_credentials (user_id) where revoked_at is null;

create table if not exists public.webauthn_challenges (
  id uuid primary key default gen_random_uuid(),
  binding_hash text not null unique,           -- sha256 of the httpOnly cookie secret
  user_id uuid null references auth.users(id) on delete cascade,
  purpose text not null check (purpose in ('register', 'login')),
  challenge text not null,
  rp_id text not null,
  origin text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz null,
  created_at timestamptz not null default now()
);
create index if not exists webauthn_challenges_expires_idx on public.webauthn_challenges (expires_at);

create table if not exists public.user_backup_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null,                     -- bcrypt (pgcrypto, cost 10)
  created_at timestamptz not null default now(),
  used_at timestamptz null
);
create index if not exists user_backup_codes_user_idx on public.user_backup_codes (user_id) where used_at is null;

create table if not exists public.user_auth_factor_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  backup_failures int not null default 0,
  backup_locked_until timestamptz null,
  updated_at timestamptz not null default now()
);

alter table public.webauthn_credentials enable row level security;
alter table public.webauthn_challenges enable row level security;
alter table public.user_backup_codes enable row level security;
alter table public.user_auth_factor_state enable row level security;
revoke all on public.webauthn_credentials, public.webauthn_challenges, public.user_backup_codes, public.user_auth_factor_state from anon, authenticated;

-- Replace all backup codes (plaintext never stored).
create or replace function public.user_set_backup_codes(p_user uuid, p_codes text[])
returns int language plpgsql security definer set search_path = '' as $$
declare c text; n int := 0; begin
  if coalesce(array_length(p_codes, 1), 0) <> 10 then raise exception 'exactly 10 codes'; end if;
  delete from public.user_backup_codes where user_id = p_user;
  foreach c in array p_codes loop
    insert into public.user_backup_codes (user_id, code_hash)
      values (p_user, extensions.crypt(upper(regexp_replace(c, '[^A-Za-z0-9]', '', 'g')), extensions.gen_salt('bf', 10)));
    n := n + 1;
  end loop;
  return n;
end $$;

-- Atomically consume one matching unused code (single use).
create or replace function public.user_use_backup_code(p_user uuid, p_code text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')); hit uuid; begin
  if length(v) <> 10 then return false; end if;
  select id into hit from public.user_backup_codes
    where user_id = p_user and used_at is null and code_hash = extensions.crypt(v, code_hash)
    limit 1 for update skip locked;
  if hit is null then return false; end if;
  update public.user_backup_codes set used_at = now() where id = hit and used_at is null;
  return found;
end $$;

revoke all on function public.user_set_backup_codes(uuid, text[]) from public, anon, authenticated;
revoke all on function public.user_use_backup_code(uuid, text) from public, anon, authenticated;
grant execute on function public.user_set_backup_codes(uuid, text[]) to service_role;
grant execute on function public.user_use_backup_code(uuid, text) to service_role;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('webauthn-challenge-cleanup', '23 * * * *', $c$delete from public.webauthn_challenges where expires_at < now() - interval '1 hour'$c$);
  end if;
end $$;

-- Backup-code sign-in needs the account id for an email (service role only, never exposed).
create or replace function public.auth_user_id_by_email(p_email text)
returns uuid language sql security definer stable set search_path = '' as $$
  select id from auth.users where lower(email) = lower(trim(p_email)) and deleted_at is null limit 1
$$;
revoke all on function public.auth_user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.auth_user_id_by_email(text) to service_role;
