-- Gideon (CEO agent) admin settings + journey-step AI agent sessions. Service-role only (RLS on, no policies).
create table if not exists public.gideon_settings (
  id smallint primary key default 1 check (id = 1),
  cost_ratio_threshold numeric not null default 2.5,
  cost_min_delta_usd numeric not null default 0.25,
  cost_per_user_min_delta_usd numeric not null default 0.02,
  cost_max_single_user_share numeric not null default 0.6,
  digest_enabled boolean not null default true,
  digest_hour smallint not null default 21 check (digest_hour between 0 and 23),
  alert_topics jsonb not null default '{"daily":true,"weekly":true,"monthly":true,"cost":true,"owner_tasks":true}'::jsonb,
  recipients jsonb not null default '[]'::jsonb,
  telegram_bot_token_enc text,
  telegram_webhook_secret_enc text,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
insert into public.gideon_settings (id) values (1) on conflict do nothing;
alter table public.gideon_settings enable row level security;
revoke all on public.gideon_settings from anon, authenticated;

create table if not exists public.journey_agent_sessions (
  id uuid primary key default gen_random_uuid(),
  created_by text not null,
  step_id uuid,
  status text not null default 'working' check (status in ('working','waiting','done','error')),
  source_text text not null,
  answers jsonb not null default '{}'::jsonb,
  analysis jsonb,
  pending_questions jsonb not null default '[]'::jsonb,
  draft jsonb,
  review jsonb,
  events jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists journey_agent_sessions_created on public.journey_agent_sessions (created_at desc);
alter table public.journey_agent_sessions enable row level security;
revoke all on public.journey_agent_sessions from anon, authenticated;

-- cost anomaly thresholds become parameters (defaults = previous hard-coded values)
drop function if exists public.cost_anomalies();
create or replace function public.cost_anomalies(
  p_ratio numeric default 2.5, p_min_delta numeric default 0.25, p_min_delta_user numeric default 0.02, p_max_share numeric default 0.6)
returns table (component text, culprit text, yesterday_usd numeric, baseline_usd numeric, ratio numeric, top_user_share numeric)
language sql stable security definer set search_path to 'public' as $$
  with d as (select * from cost_daily(16)),
  y as (select (now() at time zone 'Asia/Jerusalem')::date - 1 as day),
  comp as (select component, day, sum(cost_usd) c, max(active_users) au from d group by 1, 2),
  per_user_total as (select 'per_active_user'::text component, day, sum(c) / nullif(max(au), 0) c from comp group by 2),
  allc as (select component, day, c from comp union all select component, day, c from per_user_total),
  base as (
    select component, percentile_cont(0.5) within group (order by c) b, count(*) n
    from allc, y where allc.day < y.day and allc.day >= y.day - 14 group by 1
  ),
  yest as (select component, c from allc, y where allc.day = y.day),
  culprit as (select distinct on (component) component, culprit from d, y where d.day = y.day order by component, cost_usd desc),
  topshare as (
    select 'ai:' || feature component, max(uc) / nullif(sum(uc), 0) share from (
      select feature, user_id, sum(cost_usd) uc from ai_usage_events, y
      where (created_at at time zone 'Asia/Jerusalem')::date = y.day group by 1, 2
    ) x group by 1
  )
  select yest.component, coalesce(culprit.culprit, '-'), round(yest.c, 4), round(base.b::numeric, 4),
         round(yest.c / nullif(base.b::numeric, 0), 2), round(coalesce(topshare.share, 0), 2)
  from yest join base using (component)
  left join culprit using (component) left join topshare using (component)
  where base.n >= 5
    and yest.c >= greatest(p_ratio * base.b::numeric, base.b::numeric + case when yest.component = 'per_active_user' then p_min_delta_user else p_min_delta end)
    and coalesce(topshare.share, 0) < p_max_share;
$$;
revoke execute on function public.cost_anomalies(numeric, numeric, numeric, numeric) from public, anon, authenticated;
