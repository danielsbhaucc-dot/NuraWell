-- Gideon "stranger simulation" (Telegram red-team mode). One row per authorized private chat while active.
-- Server-only state: it can only REDUCE privileges (every update is routed to the stranger path).
create table if not exists public.gideon_stranger_sim (
  chat_id text primary key check (chat_id ~ '^\d{1,20}$'),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  attempts jsonb not null default '[]'::jsonb
);
alter table public.gideon_stranger_sim enable row level security;
revoke all on public.gideon_stranger_sim from public, anon, authenticated;
