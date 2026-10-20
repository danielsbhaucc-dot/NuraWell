-- Per-user state for the post-login "sign in with Face ID next time?" offer.
create table if not exists public.passkey_nudge_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  shown_count int not null default 0,
  last_shown_at timestamptz null,
  last_outcome text null check (last_outcome in ('shown', 'dismissed', 'enrolled')),
  updated_at timestamptz not null default now()
);
alter table public.passkey_nudge_state enable row level security;
revoke all on public.passkey_nudge_state from anon, authenticated;
