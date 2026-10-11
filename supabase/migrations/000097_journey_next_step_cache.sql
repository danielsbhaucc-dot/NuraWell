-- 000097: per-user-per-day cache for the AI-enriched "הצעד הבא" card on /journey (server-only).
create table if not exists public.journey_next_step_cache (
  user_id uuid not null references auth.users(id) on delete cascade,
  date_key text not null,
  step_id uuid,
  pace text not null,
  recommendation jsonb not null,
  model text,
  created_at timestamptz not null default now(),
  primary key (user_id, date_key)
);
alter table public.journey_next_step_cache enable row level security;
-- no policies: service role only
