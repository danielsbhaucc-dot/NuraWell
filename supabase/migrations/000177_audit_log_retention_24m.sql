-- Access/audit log retention >= 24 months (Privacy Protection Regulations (Data Security) 2017, reg. 10).
-- Only LENGTHENS retention: admin_audit_log 365d -> 730d, ops_security_events 90d/365d -> 730d.
-- Nothing else changes; deletes no rows. Function bodies are otherwise identical to the live versions.

create or replace function public.purge_expired_personal_data(p_include_user_content boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare r jsonb := '{}'::jsonb; n int;
begin
  -- security / auth artifacts
  delete from webauthn_challenges where expires_at < now() - interval '1 day'; get diagnostics n = row_count; r := r || jsonb_build_object('webauthn_challenges', n);
  delete from ops_handoff_tokens where expires_at < now() - interval '1 day'; get diagnostics n = row_count; r := r || jsonb_build_object('ops_handoff_tokens', n);
  delete from ops_login_requests where created_at < now() - interval '30 days'; get diagnostics n = row_count; r := r || jsonb_build_object('ops_login_requests', n);
  delete from demo_access_sessions where expires_at < now() - interval '30 days'; get diagnostics n = row_count; r := r || jsonb_build_object('demo_access_sessions', n);
  -- IP addresses: keep 30 days, then strip; audit rows kept 24 months (2017 regs)
  update admin_audit_log set ip = null where ip is not null and created_at < now() - interval '30 days'; get diagnostics n = row_count; r := r || jsonb_build_object('admin_audit_ip_stripped', n);
  delete from admin_audit_log where created_at < now() - interval '730 days'; get diagnostics n = row_count; r := r || jsonb_build_object('admin_audit_log', n);
  delete from ops_security_events where created_at < now() - interval '730 days'; get diagnostics n = row_count; r := r || jsonb_build_object('ops_security_events', n);
  -- diagnostics
  delete from error_events where created_at < now() - interval '30 days'; get diagnostics n = row_count; r := r || jsonb_build_object('error_events', n);
  delete from chat_perf_timings where created_at < now() - interval '90 days'; get diagnostics n = row_count; r := r || jsonb_build_object('chat_perf_timings', n);
  delete from gideon_outbox where status <> 'pending' and created_at < now() - interval '30 days'; get diagnostics n = row_count; r := r || jsonb_build_object('gideon_outbox', n);
  delete from pending_almog_commitment_jobs where processed and created_at < now() - interval '7 days'; get diagnostics n = row_count; r := r || jsonb_build_object('pending_almog_commitment_jobs', n);
  if p_include_user_content then
    delete from pending_chat_logs where processed and created_at < now() - interval '7 days'; get diagnostics n = row_count; r := r || jsonb_build_object('pending_chat_logs', n);
    delete from notifications where is_read and created_at < now() - interval '180 days'; get diagnostics n = row_count; r := r || jsonb_build_object('notifications', n);
  end if;
  return r;
end $$;

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
  cutoff24m timestamptz := now() - interval '730 days';
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
      select id from ops_security_events where created_at < cutoff24m limit p_batch);
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
