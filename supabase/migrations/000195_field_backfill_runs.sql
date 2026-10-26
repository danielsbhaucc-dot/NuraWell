-- Counts-only run log for the enc:v2 field backfill (no values, no user ids).
-- Lets us prove the cron fired and see per-table errors without platform log access.
create table if not exists public.field_backfill_runs (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  source text not null check (source in ('vercel_cron','master','manual')),
  duration_ms integer,
  result jsonb not null default '{}'::jsonb
);
alter table public.field_backfill_runs enable row level security;
revoke all on public.field_backfill_runs from anon, authenticated;
create index if not exists field_backfill_runs_created_at_idx on public.field_backfill_runs (created_at desc);
