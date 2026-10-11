-- 000102: crisis safety net — log (category only, no message text) + pause nudges
create table if not exists public.safety_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null,              -- chat | sos | onboarding
  category text not null,            -- suicidal_ideation | self_harm | eating_disorder | immediate_danger | severe_distress
  severity text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_safety_events_user on public.safety_events(user_id, created_at desc);
alter table public.safety_events enable row level security;
-- service role only (no policies)

alter table public.profiles add column if not exists notify_paused_until timestamptz;
