-- Measured AI spend: one row per LLM call with OpenRouter's billed cost (usage.cost). Service-role only.
create table if not exists public.ai_usage_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid,
  feature text not null default 'unknown',
  model text,
  prompt_tokens int,
  completion_tokens int,
  cached_tokens int,
  cost_usd numeric(12,8) not null default 0
);
create index if not exists ai_usage_events_created_idx on public.ai_usage_events (created_at desc);
create index if not exists ai_usage_events_user_idx on public.ai_usage_events (user_id, created_at desc) where user_id is not null;
alter table public.ai_usage_events enable row level security;
revoke all on public.ai_usage_events from anon, authenticated;

-- Daily cost per component (SQL only) + per-active-user stats, for the cost page trend and Gideon anomaly checks.
create or replace function public.cost_daily(p_days int default 30)
returns table (day date, component text, culprit text, cost_usd numeric, active_users int)
language sql stable security definer set search_path to 'public' as $$
  with real_users as (select id from profiles where role = 'user'),
  ai as (
    select (created_at at time zone 'Asia/Jerusalem')::date d, 'ai:' || feature comp, coalesce(model, '?') culprit, sum(cost_usd) c
    from ai_usage_events where created_at >= now() - make_interval(days => p_days) and (user_id is null or user_id in (select id from real_users))
    group by 1, 2, 3
  ),
  chat as (
    select (created_at at time zone 'Asia/Jerusalem')::date d, 'ai:chat_writer' comp, coalesce(model_name, '?') culprit,
           sum(coalesce((metadata->>'provider_cost_usd')::numeric, (metadata->>'cost_usd')::numeric, 0)) c
    from ai_interactions where role = 'assistant' and created_at >= now() - make_interval(days => p_days) and user_id in (select id from real_users)
    group by 1, 2, 3
  ),
  act as (
    select d, count(distinct u)::int n from (
      select (created_at at time zone 'Asia/Jerusalem')::date d, user_id u from ai_interactions where created_at >= now() - make_interval(days => p_days) and user_id in (select id from real_users)
      union all
      select (occurred_at at time zone 'Asia/Jerusalem')::date, user_id from task_events where occurred_at >= now() - make_interval(days => p_days) and user_id in (select id from real_users)
    ) x group by 1
  )
  select x.d, x.comp, x.culprit, x.c, coalesce(act.n, 0) from (select * from ai union all select * from chat) x left join act on act.d = x.d
  order by 1 desc, 4 desc;
$$;
revoke all on function public.cost_daily(int) from public, anon, authenticated;

-- Systemic cost anomalies (yesterday vs 14-day median), for Gideon. Ignores spikes driven by one heavy user.
create or replace function public.cost_anomalies()
returns table (component text, culprit text, yesterday_usd numeric, baseline_usd numeric, ratio numeric, top_user_share numeric)
language sql stable security definer set search_path to 'public' as $$
  with d as (select * from cost_daily(16)),
  y as (select (now() at time zone 'Asia/Jerusalem')::date - 1 as day),
  comp as (
    select component, day, sum(cost_usd) c, max(active_users) au from d group by 1, 2
  ),
  per_user_total as (
    select 'per_active_user'::text component, day, sum(c) / nullif(max(au), 0) c from comp group by 2
  ),
  allc as (select component, day, c from comp union all select component, day, c from per_user_total),
  base as (
    select component, percentile_cont(0.5) within group (order by c) b, count(*) n
    from allc, y where allc.day < y.day and allc.day >= y.day - 14 group by 1
  ),
  yest as (select component, c from allc, y where allc.day = y.day),
  culprit as (
    select distinct on (component) component, culprit from d, y where d.day = y.day order by component, cost_usd desc
  ),
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
    and yest.c >= greatest(2.5 * base.b::numeric, base.b::numeric + case when yest.component = 'per_active_user' then 0.02 else 0.25 end)
    and coalesce(topshare.share, 0) < 0.6;
$$;
revoke all on function public.cost_anomalies() from public, anon, authenticated;
