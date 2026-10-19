-- Or picks forwards up from the DB (no GitHub token needed). Lifecycle: new → in_progress → done | rejected.
-- draft/proposed stay internal (digest saved / waiting for Daniel's tap).
alter table public.ceo_dev_forwards drop constraint if exists ceo_dev_forwards_status_check;
update public.ceo_dev_forwards set status = 'new' where status in ('created', 'failed');
alter table public.ceo_dev_forwards
  add constraint ceo_dev_forwards_status_check check (status in ('draft', 'proposed', 'new', 'in_progress', 'done', 'rejected')),
  add column if not exists or_notes text,
  add column if not exists handled_at timestamptz,
  add column if not exists done_notified_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();
create index if not exists ceo_dev_forwards_status_idx on public.ceo_dev_forwards (status, created_at);
