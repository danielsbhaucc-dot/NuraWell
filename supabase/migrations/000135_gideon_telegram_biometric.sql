-- Gideon step-up moves to Telegram Mini App BiometricManager (Face ID inside Telegram).
-- admin_passkeys now holds Telegram devices: credential_id = device id, public_key = sha256 of the
-- device's biometric-protected secret (secret lives only in the phone's secure storage).
alter table public.admin_passkeys
  add column if not exists kind text not null default 'tg_bio',
  add column if not exists telegram_user_id text,
  add column if not exists activated_at timestamptz not null default now(),
  add column if not exists replaces_before timestamptz;
drop table if exists public.admin_recovery_codes;

-- Device registration requests from Telegram; approved only in Ops (admin login).
create table if not exists public.gideon_device_requests (
  id uuid primary key default gen_random_uuid(),
  chat_id text not null,
  replace boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles(id) on delete set null
);
alter table public.gideon_device_requests enable row level security;
revoke all on public.gideon_device_requests from anon, authenticated;
