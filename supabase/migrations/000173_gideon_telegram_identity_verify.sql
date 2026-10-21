-- Gideon: verify-before-block for unknown Telegram senders (replaces the hard block from #220).
-- One row per numeric Telegram from.id that is NOT on the env allowlist.
--   pending : a one-time code was emailed to the owner (hash only, short TTL, max 3 attempts)
--   allowed : verified (code or Ops+step-up) -> treated like an allowlisted private chat
--   blocked : failed / timed out / blocked in Ops -> Gideon is fully silent. Only Ops can unblock.
-- Server-only (service role). No grants to anon/authenticated.
create table if not exists public.gideon_telegram_identities (
  from_id text primary key check (from_id ~ '^\d{1,20}$'),
  status text not null check (status in ('pending', 'allowed', 'blocked')),
  code_hash text,
  code_salt text,
  expires_at timestamptz,
  attempts int not null default 0 check (attempts between 0 and 10),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by text,
  reason text check (reason is null or length(reason) <= 120)
);
create index if not exists gideon_telegram_identities_status_idx on public.gideon_telegram_identities (status);
alter table public.gideon_telegram_identities enable row level security;
revoke all on public.gideon_telegram_identities from public, anon, authenticated;
