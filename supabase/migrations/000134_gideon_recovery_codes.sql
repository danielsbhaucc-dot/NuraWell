-- One-time recovery codes for adding a passkey when no existing key is at hand (scrypt hashes only).
create table if not exists public.admin_recovery_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  code_hash text not null,
  created_at timestamptz not null default now(),
  used_at timestamptz
);
alter table public.admin_recovery_codes enable row level security;
revoke all on public.admin_recovery_codes from anon, authenticated;
