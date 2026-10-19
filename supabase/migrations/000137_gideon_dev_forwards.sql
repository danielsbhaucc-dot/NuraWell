-- Gideon → Or (developer bot): technical/quality findings forwarded as GitHub issues (label from-gideon).
-- draft = digest/finding saved so the "🛠️ העבר לאור" button can reference it; created = issue opened.
create table if not exists public.ceo_dev_forwards (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source text not null default 'digest',
  source_text text,
  title text,
  body text,
  status text not null default 'draft' check (status in ('draft', 'proposed', 'created', 'failed')),
  issue_number int,
  issue_url text,
  error text,
  action_id uuid
);
create index if not exists ceo_dev_forwards_created_idx on public.ceo_dev_forwards (created_at desc);
alter table public.ceo_dev_forwards enable row level security;
revoke all on public.ceo_dev_forwards from anon, authenticated;
