-- DB slimming, stage 3 (approved 2026-10-20). Removed values were backed up outside the repo.

-- 1) Chat cost/tokens live in ai_usage_events (metered since 2026-10-12). Carry over the older
--    per-message values first so no cost history is lost, then stop reading ai_interactions.
insert into public.ai_usage_events (created_at, user_id, feature, model, prompt_tokens, completion_tokens, cached_tokens, cost_usd)
select i.created_at, i.user_id, 'chat', i.model_name,
       nullif(i.metadata->>'input_tokens', '')::numeric::int,
       nullif(i.metadata->>'output_tokens', '')::numeric::int,
       nullif(i.metadata->>'cache_read_input_tokens', '')::numeric::int,
       coalesce(nullif(i.metadata->>'provider_cost_usd', '')::numeric, nullif(i.metadata->>'cost_usd', '')::numeric, 0)
from public.ai_interactions i
where i.role = 'assistant'
  and (i.metadata ? 'cost_usd' or i.metadata ? 'provider_cost_usd')
  and i.created_at < coalesce((select min(created_at) from public.ai_usage_events where feature = 'chat'), now());

create or replace function public.cost_daily(p_days integer default 30)
returns table(day date, component text, culprit text, cost_usd numeric, active_users integer)
language sql stable security definer set search_path to 'public' as $$
  with real_users as (select id from profiles where role = 'user'),
  ai as (
    select (created_at at time zone 'Asia/Jerusalem')::date d, 'ai:' || feature comp, coalesce(model, '?') culprit, sum(cost_usd) c
    from ai_usage_events where created_at >= now() - make_interval(days => p_days) and (user_id is null or user_id in (select id from real_users))
    group by 1, 2, 3
  ),
  act as (
    select d, count(distinct u)::int n from (
      select (created_at at time zone 'Asia/Jerusalem')::date d, user_id u from ai_interactions where created_at >= now() - make_interval(days => p_days) and user_id in (select id from real_users)
      union all
      select (occurred_at at time zone 'Asia/Jerusalem')::date, user_id from task_events where occurred_at >= now() - make_interval(days => p_days) and user_id in (select id from real_users)
    ) x group by 1
  )
  select x.d, x.comp, x.culprit, x.c, coalesce(act.n, 0) from ai x left join act on act.d = x.d
  order by 1 desc, 4 desc;
$$;

-- 2) Per-message duplicates and debug blob.
update public.ai_interactions
set metadata = metadata - array['context_router','input_tokens','output_tokens','cache_read_input_tokens','cache_creation_input_tokens','cost_usd','provider_cost_usd']
where metadata ?| array['context_router','input_tokens','output_tokens','cache_read_input_tokens','cache_creation_input_tokens','cost_usd','provider_cost_usd'];

-- 3) Notifications: no repeated first-name copy (privacy) or pending-task snapshots.
update public.notifications
set metadata = metadata - array['pending_task_ids','recipient_first_name']
where metadata ?| array['pending_task_ids','recipient_first_name'];
