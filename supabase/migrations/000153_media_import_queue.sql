-- One-shot evidence bundle drop: an operator inserts a ZIP (base64); the app imports it server-side
-- (its own signing keys) on the next Ops legal load or the nightly anchor cron. Service-role only.
create table if not exists public.media_import_queue (
  id uuid primary key default gen_random_uuid(),
  zip_sha text not null unique,
  zip_b64 text not null,
  actor_id uuid not null,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  result jsonb
);
alter table public.media_import_queue enable row level security;
revoke all on public.media_import_queue from anon, authenticated;
