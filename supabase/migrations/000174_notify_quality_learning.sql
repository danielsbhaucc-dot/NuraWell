-- Notification quality learning loop.
-- notify_quality_events: every lint fix / rejection / LLM edit, anonymized (first name → [NAME], no user_id).
-- notify_style_rules: short, capped, versioned "avoid X → say Y" list learned nightly; reviewed in Ops.
create table if not exists public.notify_quality_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  stage text not null check (stage in ('lint_fix','lint_reject','qc_edit','qc_reject','sweep_fix')),
  category text not null,
  source text,
  before_text text not null check (char_length(before_text) <= 400),
  after_text text check (char_length(after_text) <= 400)
);
create index if not exists notify_quality_events_created_idx on public.notify_quality_events (created_at);
alter table public.notify_quality_events enable row level security;

create table if not exists public.notify_style_rules (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version int not null default 1,
  avoid text not null check (char_length(avoid) between 2 and 80),
  prefer text not null check (char_length(prefer) <= 80),
  category text not null default 'phrasing',
  hits int not null default 0,
  active boolean not null default true,
  -- literal replacement applied by the deterministic gate (auto when hits ≥ 4, or switched on in Ops)
  auto_fix boolean not null default false,
  origin text not null default 'llm' check (origin in ('llm','manual')),
  -- set once Daniel touched the rule in Ops: the nightly job never overrides active/auto_fix again
  reviewed boolean not null default false,
  -- soft delete (tombstone) so a deleted rule is not re-learned the next night
  deleted boolean not null default false,
  unique (avoid)
);
alter table public.notify_style_rules enable row level security;

create table if not exists public.notify_style_rules_meta (
  id int primary key default 1 check (id = 1),
  version int not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.notify_style_rules_meta enable row level security;
insert into public.notify_style_rules_meta (id, version) values (1, 0) on conflict do nothing;

-- per-day metrics for Ops (Israel days): events by stage vs. AI notifications created
create or replace function public.notify_quality_daily(p_days int default 30)
returns table (day date, notifications int, lint_fix int, lint_reject int, qc_edit int, qc_reject int, sweep_fix int)
language sql stable security definer set search_path = public as $$
  with d as (
    select generate_series((now() at time zone 'Asia/Jerusalem')::date - greatest(1, least(p_days, 120)) + 1,
                           (now() at time zone 'Asia/Jerusalem')::date, interval '1 day')::date as dd
  ),
  n as (
    select (created_at at time zone 'Asia/Jerusalem')::date as dd, count(*)::int as c
    from notifications where type = 'ai_message' and created_at > now() - make_interval(days => p_days + 1) group by 1
  ),
  e as (
    select (created_at at time zone 'Asia/Jerusalem')::date as dd, stage, count(*)::int as c
    from notify_quality_events where created_at > now() - make_interval(days => p_days + 1) group by 1, 2
  )
  select d.dd, coalesce(n.c, 0),
    coalesce(sum(e.c) filter (where e.stage = 'lint_fix'), 0)::int,
    coalesce(sum(e.c) filter (where e.stage = 'lint_reject'), 0)::int,
    coalesce(sum(e.c) filter (where e.stage = 'qc_edit'), 0)::int,
    coalesce(sum(e.c) filter (where e.stage = 'qc_reject'), 0)::int,
    coalesce(sum(e.c) filter (where e.stage = 'sweep_fix'), 0)::int
  from d left join n on n.dd = d.dd left join e on e.dd = d.dd
  group by d.dd, n.c order by d.dd;
$$;
revoke all on function public.notify_quality_daily(int) from public, anon, authenticated;
grant execute on function public.notify_quality_daily(int) to service_role;
