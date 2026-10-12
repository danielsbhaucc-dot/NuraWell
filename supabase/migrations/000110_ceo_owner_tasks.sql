-- Gideon's task tracker for Daniel: ONLY human-only items (film HeyGen videos, legal/billing decisions, account actions).
create table if not exists public.ceo_owner_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  detail text not null default '',
  status text not null default 'open' check (status in ('open','snoozed','done','canceled')),
  priority text not null default 'normal' check (priority in ('high','normal','low')),
  origin text not null default 'ceo' check (origin in ('content','legal','billing','account','ops','ceo','daniel')),
  due_date date,
  snoozed_until timestamptz,
  last_reminded_at timestamptz,
  created_at timestamptz not null default now(),
  done_at timestamptz
);
create index if not exists ceo_owner_tasks_open_idx on public.ceo_owner_tasks (status, due_date);
-- no duplicate open task with the same title
create unique index if not exists ceo_owner_tasks_open_title_uq on public.ceo_owner_tasks (lower(btrim(title))) where status in ('open','snoozed');
alter table public.ceo_owner_tasks enable row level security;
revoke all on public.ceo_owner_tasks from anon, authenticated;
