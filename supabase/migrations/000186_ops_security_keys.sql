-- Hardware security keys (FIDO2 / WebAuthn, "tap") for admin login to Ops.
-- A key is an Ops credential: tapping it approves a new device for the owner of the key. Public keys only (no secrets).
-- Service-role only; product-agnostic (no NuraWell-specific columns).
create table if not exists public.ops_security_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  credential_id text not null unique check (char_length(credential_id) <= 1400),
  public_key text not null check (char_length(public_key) <= 2000),
  counter bigint not null default 0,
  transports text[] not null default '{}',
  aaguid text check (char_length(aaguid) <= 64),
  label text not null check (char_length(label) <= 60),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index if not exists ops_security_keys_user_idx on public.ops_security_keys (user_id) where revoked_at is null;
alter table public.ops_security_keys enable row level security;
revoke all on public.ops_security_keys from anon, authenticated;
