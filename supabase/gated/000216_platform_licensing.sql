-- GATED — DO NOT APPLY YET. Reviewed migration for offline module licensing (packages/@platform/licensing).
-- Lives outside supabase/migrations/ so no runner picks it up. Apply only after Daniel approves selling.
-- Licensee identity is stored encrypted by the app (enc:v2 via sealRow/systemDek); revocation reasons too.
-- Nothing here is read by buyers: buyers only see the signed static revocation list (lid + state + until).

create table if not exists public.platform_licenses (
  lid text primary key,
  module_id text not null,
  version_range text not null,
  licensee_ref text not null,            -- opaque id we chose, not an email
  licensee_name_enc text,                -- enc:v2:... (app-encrypted)
  domains text[] not null default '{}',
  mode text not null check (mode in ('bundle','source')),
  issued_at timestamptz not null default now(),
  expires_at timestamptz,
  superseded_by text references public.platform_licenses(lid),
  issued_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.platform_license_revocations (
  lid text primary key references public.platform_licenses(lid) on delete cascade,
  state text not null check (state in ('suspended_until','suspended_until_payment','revoked_permanent')),
  until timestamptz,
  reason_enc text,                       -- enc:v2:... only; never in the public list
  updated_by uuid,
  updated_at timestamptz not null default now(),
  check (state <> 'suspended_until' or until is not null)
);

create table if not exists public.platform_revocation_list_state (
  id smallint primary key default 1 check (id = 1),
  version bigint not null default 0,      -- monotonic; clients reject anything lower
  published_at timestamptz
);
insert into public.platform_revocation_list_state (id, version) values (1, 0) on conflict do nothing;

alter table public.platform_licenses enable row level security;
alter table public.platform_license_revocations enable row level security;
alter table public.platform_revocation_list_state enable row level security;
revoke all on public.platform_licenses, public.platform_license_revocations, public.platform_revocation_list_state from anon, authenticated;

create or replace function public.platform_bump_revocation_version() returns bigint
language sql security definer set search_path = public as $$
  update public.platform_revocation_list_state set version = version + 1, published_at = now() where id = 1 returning version;
$$;
revoke all on function public.platform_bump_revocation_version() from public, anon, authenticated;
