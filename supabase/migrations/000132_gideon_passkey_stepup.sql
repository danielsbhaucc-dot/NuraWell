-- Gideon step-up: passkeys (WebAuthn), one-time challenges, kill switch, lockout, trust window.
create table if not exists public.admin_passkeys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  credential_id text not null unique,
  public_key text not null,          -- SPKI DER, base64url (public, not a secret)
  alg int not null,                  -- COSE alg: -7 ES256 / -257 RS256
  sign_count bigint not null default 0,
  label text not null default '',
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
alter table public.admin_passkeys enable row level security;

create table if not exists public.webauthn_challenges (
  id uuid primary key default gen_random_uuid(),
  purpose text not null check (purpose in ('register', 'approve', 'unlock', 'verify')),
  action_id uuid references public.ceo_pending_actions(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  token_hash text not null unique,   -- sha256 of the one-time link token
  challenge text,                    -- current WebAuthn challenge (base64url)
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists webauthn_challenges_expires_idx on public.webauthn_challenges (expires_at);
alter table public.webauthn_challenges enable row level security;

revoke all on public.admin_passkeys, public.webauthn_challenges from anon, authenticated;

alter table public.gideon_settings
  add column if not exists disabled boolean not null default false,
  add column if not exists disabled_reason text,
  add column if not exists locked_until timestamptz,
  add column if not exists failed_stepups int not null default 0,
  add column if not exists stepup_trust_minutes int not null default 240,
  add column if not exists reverify_minutes int not null default 1440,
  add column if not exists trusted_until timestamptz,
  add column if not exists last_verified_at timestamptz;
