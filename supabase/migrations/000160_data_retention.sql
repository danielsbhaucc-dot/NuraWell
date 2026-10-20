-- Automatic data retention (approved by owner 2026-10-20).
-- Called nightly from the master job (no pg_cron on this project) via rpc('run_data_retention').
-- NEVER touches: chat / ai_interactions, memories, consents, evidence, audit logs.
-- error_events (30d) and delivery_log (90d) are already pruned in master.ts; kept there.

create table if not exists public.ai_usage_monthly (
  month date not null,
  user_id uuid,
  feature text not null,
  model text not null default '',
  events bigint not null default 0,
  prompt_tokens bigint not null default 0,
  completion_tokens bigint not null default 0,
  cached_tokens bigint not null default 0,
  cost_usd numeric not null default 0,
  updated_at timestamptz not null default now()
);
create unique index if not exists ai_usage_monthly_key
  on public.ai_usage_monthly (month, coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), feature, model);
alter table public.ai_usage_monthly enable row level security;
revoke all on public.ai_usage_monthly from anon, authenticated;

create or replace function public.run_data_retention(p_batch int default 5000)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  n int;
  i int;
  c_usage bigint := 0; c_pending bigint := 0; c_notif bigint := 0;
  c_nlogs bigint := 0; c_tlogs bigint := 0; c_sec bigint := 0;
  cutoff90 timestamptz := now() - interval '90 days';
  cutoff12m timestamptz := now() - interval '12 months';
  result jsonb;
begin
  -- ai_usage_events: roll up into monthly summary, then delete (same statement = atomic)
  for i in 1..200 loop
    with del as (
      delete from ai_usage_events e
      where e.id in (select id from ai_usage_events where created_at < cutoff90 order by id limit p_batch)
      returning e.*
    ), agg as (
      insert into ai_usage_monthly as m (month, user_id, feature, model, events, prompt_tokens, completion_tokens, cached_tokens, cost_usd)
      select date_trunc('month', created_at)::date, user_id, feature, coalesce(model, ''),
             count(*), coalesce(sum(prompt_tokens),0), coalesce(sum(completion_tokens),0),
             coalesce(sum(cached_tokens),0), coalesce(sum(cost_usd),0)
      from del group by 1,2,3,4
      on conflict (month, coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), feature, model)
      do update set events = m.events + excluded.events,
                    prompt_tokens = m.prompt_tokens + excluded.prompt_tokens,
                    completion_tokens = m.completion_tokens + excluded.completion_tokens,
                    cached_tokens = m.cached_tokens + excluded.cached_tokens,
                    cost_usd = m.cost_usd + excluded.cost_usd,
                    updated_at = now()
      returning 1
    )
    select count(*) into n from del;
    c_usage := c_usage + n; exit when n < p_batch;
  end loop;

  -- pending_chat_logs: only rows already processed
  for i in 1..200 loop
    delete from pending_chat_logs where id in (
      select id from pending_chat_logs where processed and created_at < cutoff90 limit p_batch);
    get diagnostics n = row_count; c_pending := c_pending + n; exit when n < p_batch;
  end loop;

  -- notifications: only read ones older than 12 months
  for i in 1..200 loop
    delete from notifications where id in (
      select id from notifications where is_read is true and created_at < cutoff12m limit p_batch);
    get diagnostics n = row_count; c_notif := c_notif + n; exit when n < p_batch;
  end loop;

  for i in 1..200 loop
    delete from notification_logs where id in (
      select id from notification_logs where created_at < cutoff90 limit p_batch);
    get diagnostics n = row_count; c_nlogs := c_nlogs + n; exit when n < p_batch;
  end loop;

  for i in 1..200 loop
    delete from task_logs where id in (
      select id from task_logs where completed_at < cutoff90 limit p_batch);
    get diagnostics n = row_count; c_tlogs := c_tlogs + n; exit when n < p_batch;
  end loop;

  for i in 1..200 loop
    delete from ops_security_events where id in (
      select id from ops_security_events where created_at < cutoff90 limit p_batch);
    get diagnostics n = row_count; c_sec := c_sec + n; exit when n < p_batch;
  end loop;

  result := jsonb_build_object(
    'ai_usage_events_rolled_up', c_usage, 'pending_chat_logs', c_pending,
    'notifications_read', c_notif, 'notification_logs', c_nlogs,
    'task_logs', c_tlogs, 'ops_security_events', c_sec);

  insert into admin_audit_log (method, path, detail)
  values ('RETENTION', 'db/run_data_retention', result);

  return result;
end;
$$;

revoke all on function public.run_data_retention(int) from public, anon, authenticated;
grant execute on function public.run_data_retention(int) to service_role;
