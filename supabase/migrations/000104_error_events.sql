-- 000104: free error tracking — server errors land here (via lib/monitoring/report-error + instrumentation onRequestError). 30-day retention by master cron.
create table if not exists public.error_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  environment text not null,
  severity text not null,
  source text,
  route text,
  message text not null,
  stack text,
  user_id uuid,
  tags jsonb not null default '{}'::jsonb
);
create index if not exists idx_error_events_created on public.error_events(created_at desc);
create index if not exists idx_error_events_source on public.error_events(source, created_at desc);
alter table public.error_events enable row level security;
-- service role only
