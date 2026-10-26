-- 000214 (sec/enc-close-2): close admin_audit_log.detail, ops_security_events.detail, auth_session_trail.ip/user_agent.
--
-- 1) facts / detail split. `facts` (plain jsonb) holds ONLY ids, fixed codes, counts and dates: what SQL writers
--    produce (break-glass, data retention) and what the app dedupes on (`.contains('facts', {key|day})`).
--    `detail` (everything else, e.g. device label/location, alert titles) is registered in field-registry and sealed
--    enc:v2 by the app fetch wrapper under the system 'audit' key. SQL functions never write detail again.
-- 2) auth_session_trail: the auth.sessions trigger (000189) has no key, so it keeps writing ip/user_agent; the
--    session-trail-seal cron (every 5 min) seals them and fills ip_bidx (HMAC) in one verified CAS update.
--    No reject trigger on this table (it would drop the trail row); the nightly plaintext monitor FAILS on any
--    plaintext row older than 15 minutes instead. ops_session_trail filters IPs by ip_bidx (+ plain arm for new rows).
-- Order: apply this migration BEFORE deploying the code (the code writes `facts` and calls the new rpc signature).

alter table public.admin_audit_log add column if not exists facts jsonb;
alter table public.ops_security_events add column if not exists facts jsonb;
create index if not exists ops_security_events_facts_idx on public.ops_security_events using gin (facts jsonb_path_ops);
comment on column public.admin_audit_log.facts is 'plain: ids/codes/counts only (SQL writers, dedupe). Free text goes to detail (enc:v2).';
comment on column public.ops_security_events.facts is 'plain: ids/codes/counts only (SQL writers, dedupe). Free text goes to detail (enc:v2).';

-- break-glass must keep working from the SQL editor with the app down: it writes facts only (uuid + counts).
create or replace function public.ops_break_glass_reset(owner uuid default null)
returns table (recovery_code text) language plpgsql security definer set search_path = '' as $$
declare u uuid := owner; d int; s int; codes text[] := '{}'; raw text; alpha text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; i int; j int; begin
  if u is null then
    select p.id into u from public.profiles p where p.role = 'admin';
    if (select count(*) from public.profiles where role = 'admin') <> 1 then
      raise exception 'more than one admin: pass the owner uuid';
    end if;
  end if;
  if not exists (select 1 from public.profiles where id = u and role = 'admin') then raise exception 'not an admin'; end if;
  update public.ops_trusted_devices set revoked_at = now() where user_id = u and revoked_at is null;
  get diagnostics d = row_count;
  update public.ops_login_requests set status = 'expired' where user_id = u and status in ('pending', 'approved');
  delete from public.ops_handoff_tokens where user_id = u;
  delete from public.ops_security_state where user_id = u;
  delete from auth.sessions where user_id = u;
  get diagnostics s = row_count;
  for i in 1..10 loop
    raw := '';
    for j in 1..10 loop
      raw := raw || substr(alpha, 1 + (get_byte(extensions.gen_random_bytes(1), 0) % 32), 1);
    end loop;
    codes := codes || (substr(raw, 1, 5) || '-' || substr(raw, 6, 5));
  end loop;
  perform public.ops_set_recovery_codes(u, codes);
  insert into public.admin_audit_log (actor_id, method, path, facts)
    values (null, 'BREAK_GLASS', 'ops_break_glass_reset', jsonb_build_object('user', u, 'devices', d, 'sessions', s, 'db_user', current_user));
  insert into public.ops_security_events (kind, facts)
    values ('break_glass', jsonb_build_object('user', u, 'devices', d, 'sessions', s));
  return query select unnest(codes);
end $$;

-- data retention summary: counts only -> facts.
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

  insert into admin_audit_log (method, path, facts)
  values ('RETENTION', 'db/run_data_retention', result);

  return result;
end;
$$;

-- legal evidence window: search ids in facts (detail is ciphertext); detail returned as stored, the app decrypts it.
drop function if exists public.legal_db_audit_window(uuid, timestamptz, timestamptz);
create function public.legal_db_audit_window(p_user uuid, p_start timestamptz, p_end timestamptz)
returns table(source text, ts timestamptz, action text, detail jsonb, facts jsonb)
language sql stable security definer set search_path = '' as $$
  (select 'auth.audit_log_entries'::text, a.created_at, coalesce(a.payload->>'action', ''), a.payload::jsonb - 'traits', null::jsonb
     from auth.audit_log_entries a
    where a.created_at between p_start and p_end
      and (a.payload->>'actor_id' = p_user::text or a.payload->'traits'->>'user_id' = p_user::text)
    order by a.created_at limit 200)
  union all
  (select 'public.admin_audit_log'::text, l.created_at, l.method || ' ' || l.path, l.detail, l.facts
     from public.admin_audit_log l
    where l.created_at between p_start and p_end
      and (l.actor_id = p_user or l.path like '%' || p_user::text || '%' or l.facts::text like '%' || p_user::text || '%'
           or (l.detail::text not like '"enc:%' and l.detail::text like '%' || p_user::text || '%'))
    order by l.created_at limit 200)
$$;
revoke all on function public.legal_db_audit_window(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.legal_db_audit_window(uuid, timestamptz, timestamptz) to service_role;

-- session trail: blind index for the cross-user IP lookup; the plaintext ip index is useless on ciphertext.
alter table public.auth_session_trail add column if not exists ip_bidx text;
drop index if exists public.auth_session_trail_ip_idx;
create index if not exists auth_session_trail_ip_bidx_idx on public.auth_session_trail (ip_bidx, created_at desc) where ip_bidx is not null;
create index if not exists auth_session_trail_session_idx on public.auth_session_trail (session_id);
-- sweep queue: rows the cron still has to seal
create index if not exists auth_session_trail_plain_idx on public.auth_session_trail (created_at)
  where ip not like 'enc:%' or user_agent not like 'enc:%';

drop function if exists public.ops_session_trail(uuid, text, timestamptz, timestamptz);
create function public.ops_session_trail(p_user uuid, p_ip text, p_ip_bidx text, p_start timestamptz, p_end timestamptz)
returns table (ts timestamptz, session_id uuid, user_id uuid, aal text, ip text, user_agent text)
language sql stable security definer set search_path = '' as $$
  select t.created_at, t.session_id, t.user_id, t.aal, t.ip, t.user_agent from public.auth_session_trail t
  where t.created_at between p_start and p_end
    and ((p_user is not null and t.user_id = p_user)
      or (p_ip_bidx is not null and t.ip_bidx = p_ip_bidx)
      or (p_ip is not null and t.ip_bidx is null and t.ip = p_ip)) -- rows not swept yet (< 5 min)
  order by t.created_at limit 400
$$;
revoke all on function public.ops_session_trail(uuid, text, text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.ops_session_trail(uuid, text, text, timestamptz, timestamptz) to service_role;

-- enc-reject-triggers: generated by apps/web/scripts/gen-enc-triggers.mts — do not edit
-- spec {"admin_audit_log":["detail","ip"],"ai_interaction_edits":["edited_content","original_content"],"ai_interactions":["content","metadata"],"almog_assignments":["detail","history","metadata","reason","source_excerpt","title"],"almog_blockers":["current_options","description","history","metadata","strategy"],"almog_focus_periods":["metadata","reason"],"almog_interventions":["metadata","strategy"],"almog_kickoff_status":["last_error","skip_reason"],"billing_events":["metadata"],"ceo_audit_log":["detail"],"ceo_conversations":["summary","turns"],"ceo_dev_forwards":["body","error","or_notes","source_text","title"],"ceo_owner_tasks":["detail","title"],"ceo_pending_actions":["args","result","summary"],"challenge_admin_audit_log":["payload","summary"],"challenge_enrollments":["completion_summary","eating_window","metadata"],"challenge_interview_sessions":["extracted_insights","transcript"],"challenge_success_events":["description","evidence","title"],"challenge_task_completions":["metadata"],"chat_periodic_summaries":["ai_insight","metrics"],"chat_sessions":["live_conversation_file","preview_text","summary","title"],"chat_task_proposals":["reason","title"],"chat_transcript_access_requests":["admin_note","reason","user_response_note"],"chat_transcript_admin_audit_log":["payload","reason","summary"],"churn_feedback":["detail"],"consent_evidence":["payload_json","rendered_html","screenshot_segments","typed_word","user_agent"],"consent_evidence_attestations":["payload"],"daily_action_instances":["display_title","metadata","original_title"],"delivery_log":["error","recipient_mask"],"demo_access_links":["guest_name","reason"],"enrollments":["granted_reason"],"error_events":["stack","tags"],"gideon_outbox":["buttons","chat_id","reason","text"],"gideon_settings":["recipients"],"gideon_telegram_identities":["reason"],"guardian_sos_events":["metadata","strategy_offered","trigger"],"guide_access_grants":["granted_reason","signal_text"],"ip_blocks":["note","reason"],"journey_next_step_cache":["recommendation"],"journey_progress":["game_answers","habit_meta","habits_progress","quiz_answers","task_level_meta"],"journey_task_executions":["note"],"legal_access_log":["detail"],"legal_export_secrets":["case_ref","file_name","label","subject"],"lesson_progress":["habit_progress","task_progress"],"media_receipts":["attachments","confirmation_code","confirmation_link","original_from","subject"],"notification_fall_episodes":["metadata","reason_summary"],"notification_logs":["body","metadata","task_name"],"notifications":["body","metadata","title"],"notify_quality_events":["after_text","before_text"],"notify_style_rules":["avoid","prefer"],"ops_admin_notifications":["body","metadata","title"],"ops_login_requests":["label","location"],"ops_security_events":["detail"],"ops_trusted_devices":["browser","countries_seen","label","last_country","last_ip_masked"],"pending_almog_commitment_jobs":["assistant_message","habit_title_to_id","habit_titles","last_error","rolling_summary","user_message"],"pending_chat_logs":["raw_chat_text"],"periodic_summaries":["ai_insight","metrics"],"profiles":["activity_level","ai_context","ai_system_prompt","avatar_url","current_weight_kg","daily_task","dietary_preferences","full_name","gender","goal_weight_kg","health_conditions","height_cm","main_goal","main_obstacle","main_obstacle_detail","meal_schedule","pending_ai_proposal","phone","safety_screening","weakest_time_of_day"],"safety_events":["category","severity"],"scheduled_reminders":["body","metadata","title"],"security_incidents":["actions"],"security_signals":["country","path"],"stepup_requests":["approver_device_label","requester_city","requester_label"],"task_definitions":["description","ladder","schedule","title"],"task_events":["metadata","reason"],"task_logs":["task_name"],"tg_action_nonces":["country"],"user_consents":["metadata"],"user_insights":["insight_text","metadata"],"user_journey_step_unlocks":["reason"],"user_measurements":["bmi","height_cm","notes","weight_kg"],"user_memories":["memory_text"],"user_memory_dossier":["coaching_profile","essentials","goals","habit_memory","health_context","inferred_insights","personal_context","psychology","risk_signals","schedule_memory","tags","task_memory"],"user_mentorship_strategy":["active_blockers","current_focus","medical_red_flags","next_best_action","psychological_approach"],"user_plans":["description","plan_data","title"],"user_task_assignments":["reason"]}

insert into public.field_enc_enforcement (table_name) values
  ('admin_audit_log'),
  ('ai_interaction_edits'),
  ('ai_interactions'),
  ('almog_assignments'),
  ('almog_blockers'),
  ('almog_focus_periods'),
  ('almog_interventions'),
  ('almog_kickoff_status'),
  ('billing_events'),
  ('ceo_audit_log'),
  ('ceo_conversations'),
  ('ceo_dev_forwards'),
  ('ceo_owner_tasks'),
  ('ceo_pending_actions'),
  ('challenge_admin_audit_log'),
  ('challenge_enrollments'),
  ('challenge_interview_sessions'),
  ('challenge_success_events'),
  ('challenge_task_completions'),
  ('chat_periodic_summaries'),
  ('chat_sessions'),
  ('chat_task_proposals'),
  ('chat_transcript_access_requests'),
  ('chat_transcript_admin_audit_log'),
  ('churn_feedback'),
  ('consent_evidence'),
  ('consent_evidence_attestations'),
  ('daily_action_instances'),
  ('delivery_log'),
  ('demo_access_links'),
  ('enrollments'),
  ('error_events'),
  ('gideon_outbox'),
  ('gideon_settings'),
  ('gideon_telegram_identities'),
  ('guardian_sos_events'),
  ('guide_access_grants'),
  ('ip_blocks'),
  ('journey_next_step_cache'),
  ('journey_progress'),
  ('journey_task_executions'),
  ('legal_access_log'),
  ('legal_export_secrets'),
  ('lesson_progress'),
  ('media_receipts'),
  ('notification_fall_episodes'),
  ('notification_logs'),
  ('notifications'),
  ('notify_quality_events'),
  ('notify_style_rules'),
  ('ops_admin_notifications'),
  ('ops_login_requests'),
  ('ops_security_events'),
  ('ops_trusted_devices'),
  ('pending_almog_commitment_jobs'),
  ('pending_chat_logs'),
  ('periodic_summaries'),
  ('profiles'),
  ('safety_events'),
  ('scheduled_reminders'),
  ('security_incidents'),
  ('security_signals'),
  ('stepup_requests'),
  ('task_definitions'),
  ('task_events'),
  ('task_logs'),
  ('tg_action_nonces'),
  ('user_consents'),
  ('user_insights'),
  ('user_journey_step_unlocks'),
  ('user_measurements'),
  ('user_memories'),
  ('user_memory_dossier'),
  ('user_mentorship_strategy'),
  ('user_plans'),
  ('user_task_assignments')
on conflict (table_name) do nothing;

do $g$ begin if to_regclass('public.admin_audit_log') is not null then
  drop trigger if exists zz_enc_reject_plaintext on public.admin_audit_log;
  create trigger zz_enc_reject_plaintext before insert or update on public.admin_audit_log
    for each row execute function public.enc_reject_plaintext('detail', 'ip');
end if; end $g$;
do $g$ begin if to_regclass('public.ai_interaction_edits') is not null then
  drop trigger if exists zz_enc_reject_plaintext on public.ai_interaction_edits;
  create trigger zz_enc_reject_plaintext before insert or update on public.ai_interaction_edits
    for each row execute function public.enc_reject_plaintext('edited_content', 'original_content');
end if; end $g$;
do $g$ begin if to_regclass('public.ai_interactions') is not null then
  drop trigger if exists zz_enc_reject_plaintext on public.ai_interactions;
  create trigger zz_enc_reject_plaintext before insert or update on public.ai_interactions
    for each row execute function public.enc_reject_plaintext('content', 'metadata');
end if; end $g$;
do $g$ begin if to_regclass('public.almog_assignments') is not null then
  drop trigger if exists zz_enc_reject_plaintext on public.almog_assignments;
  create trigger zz_enc_reject_plaintext before insert or update on public.almog_assignments
    for each row execute function public.enc_reject_plaintext('detail', 'history', 'metadata', 'reason', 'source_excerpt', 'title');
end if; end $g$;
do $g$ begin if to_regclass('public.almog_blockers') is not null then
  drop trigger if exists zz_enc_reject_plaintext on public.almog_blockers;
  create trigger zz_enc_reject_plaintext before insert or update on public.almog_blockers
    for each row execute function public.enc_reject_plaintext('current_options', 'description', 'history', 'metadata', 'strategy');
end if; end $g$;
do $g$ begin if to_regclass('public.almog_focus_periods') is not null then
  drop trigger if exists zz_enc_reject_plaintext on public.almog_focus_periods;
  create trigger zz_enc_reject_plaintext before insert or update on public.almog_focus_periods
    for each row execute function public.enc_reject_plaintext('metadata', 'reason');
end if; end $g$;
do $g$ begin if to_regclass('public.almog_interventions') is not null then
  drop trigger if exists zz_enc_reject_plaintext on public.almog_interventions;
  create trigger zz_enc_reject_plaintext before insert or update on public.almog_interventions
    for each row execute function public.enc_reject_plaintext('metadata', 'strategy');
end if; end $g$;
do $g$ begin if to_regclass('public.almog_kickoff_status') is not null then
  drop trigger if exists zz_enc_reject_plaintext on public.almog_kickoff_status;
  create trigger zz_enc_reject_plaintext before insert or update on public.almog_kickoff_status
    for each row execute function public.enc_reject_plaintext('last_error', 'skip_reason');
end if; end $g$;
do $g$ begin if to_regclass('public.billing_events') is not null then
  drop trigger if exists zz_enc_reject_plaintext on public.billing_events;
  create trigger zz_enc_reject_plaintext before insert or update on public.billing_events
    for each row execute function public.enc_reject_plaintext('metadata');
end if; end $g$;
do $g$ begin if to_regclass('public.ceo_audit_log') is not null then
  drop trigger if exists zz_enc_reject_plaintext on public.ceo_audit_log;
  create trigger zz_enc_reject_plaintext before insert or update on public.ceo_audit_log
    for each row execute function public.enc_reject_plaintext('detail');
end if; end $g$;
do $g$ begin if to_regclass('public.ceo_conversations') is not null then
  drop trigger if exists zz_enc_reject_plaintext on public.ceo_conversations;
  create trigger zz_enc_reject_plaintext before insert or update on public.ceo_conversations
    for each row execute function public.enc_reject_plaintext('summary', 'turns');
end if; end $g$;
do $g$ begin if to_regclass('public.ceo_dev_forwards') is not null then
  drop trigger if exists zz_enc_reject_plaintext on public.ceo_dev_forwards;
  create trigger zz_enc_reject_plaintext before insert or update on public.ceo_dev_forwards
    for each row execute function public.enc_reject_plaintext('body', 'error', 'or_notes', 'source_text', 'title');
end if; end $g$;
do $g$ begin if to_regclass('public.ceo_owner_tasks') is not null then
  drop trigger if exists zz_enc_reject_plaintext on public.ceo_owner_tasks;
  create trigger zz_enc_reject_plaintext before insert or update on public.ceo_owner_tasks
    for each row execute function public.enc_reject_plaintext('detail', 'title');
end if; end $g$;
do $g$ begin if to_regclass('public.ceo_pending_actions') is not null then
  drop trigger if exists zz_enc_reject_plaintext on public.ceo_pending_actions;
  create trigger zz_enc_reject_plaintext before insert or update on public.ceo_pending_actions
    for each row execute function public.enc_reject_plaintext('args', 'result', 'summary');
end if; end $g$;
do $g$ begin if to_regclass('public.challenge_admin_audit_log') is not null then
  drop trigger if exists zz_enc_reject_plaintext on public.challenge_admin_audit_log;
  create trigger zz_enc_reject_plaintext before insert or update on public.challenge_admin_audit_log
    for each row execute function public.enc_reject_plaintext('payload', 'summary');
end if; end $g$;
do $g$ begin if to_regclass('public.challenge_enrollments') is not null then
  drop trigger if exists zz_enc_reject_plaintext on public.challenge_enrollments;
  create trigger zz_enc_reject_plaintext before insert or update on public.challenge_enrollments
    for each row execute function public.enc_reject_plaintext('completion_summary', 'eating_window', 'metadata');
end if; end $g$;
do $g$ begin if to_regclass('public.challenge_interview_sessions') is not null then
  drop trigger if exists zz_enc_reject_plaintext on public.challenge_interview_sessions;
  create trigger zz_enc_reject_plaintext before insert or update on public.challenge_interview_sessions
    for each row execute function public.enc_reject_plaintext('extracted_insights', 'transcript');
end if; end $g$;
do $g$ begin if to_regclass('public.challenge_success_events') is not null then
  drop trigger if exists zz_enc_reject_plaintext on public.challenge_success_events;
  create trigger zz_enc_reject_plaintext before insert or update on public.challenge_success_events
    for each row execute function public.enc_reject_plaintext('description', 'evidence', 'title');
end if; end $g$;
do $g$ begin if to_regclass('public.challenge_task_completions') is not null then
  drop trigger if exists zz_enc_reject_plaintext on public.challenge_task_completions;
  create trigger zz_enc_reject_plaintext before insert or update on public.challenge_task_completions
    for each row execute function public.enc_reject_plaintext('metadata');
end if; end $g$;
do $g$ begin if to_regclass('public.chat_periodic_summaries') is not null then
  drop trigger if exists zz_enc_reject_plaintext on public.chat_periodic_summaries;
  create trigger zz_enc_reject_plaintext before insert or update on public.chat_periodic_summaries
    for each row execute function public.enc_reject_plaintext('ai_insight', 'metrics');
end if; end $g$;
do $g$ begin if to_regclass('public.chat_sessions') is not null then
  drop trigger if exists zz_enc_reject_plaintext on public.chat_sessions;
  create trigger zz_enc_reject_plaintext before insert or update on public.chat_sessions
    for each row execute function public.enc_reject_plaintext('live_conversation_file', 'preview_text', 'summary', 'title');
end if; end $g$;
do $g$ begin if to_regclass('public.chat_task_proposals') is not null then
  drop trigger if exists zz_enc_reject_plaintext on public.chat_task_proposals;
  create trigger zz_enc_reject_plaintext before insert or update on public.chat_task_proposals
    for each row execute function public.enc_reject_plaintext('reason', 'title');
end if; end $g$;
do $g$ begin if to_regclass('public.chat_transcript_access_requests') is not null then
  drop trigger if exists zz_enc_reject_plaintext on public.chat_transcript_access_requests;
  create trigger zz_enc_reject_plaintext before insert or update on public.chat_transcript_access_requests
    for each row execute function public.enc_reject_plaintext('admin_note', 'reason', 'user_response_note');
end if; end $g$;
do $g$ begin if to_regclass('public.chat_transcript_admin_audit_log') is not null then
  drop trigger if exists zz_enc_reject_plaintext on public.chat_transcript_admin_audit_log;
  create trigger zz_enc_reject_plaintext before insert or update on public.chat_transcript_admin_audit_log
    for each row execute function public.enc_reject_plaintext('payload', 'reason', 'summary');
end if; end $g$;
do $g$ begin if to_regclass('public.churn_feedback') is not null then
  drop trigger if exists zz_enc_reject_plaintext on public.churn_feedback;
  create trigger zz_enc_reject_plaintext before insert or update on public.churn_feedback
    for each row execute function public.enc_reject_plaintext('detail');
end if; end $g$;
do $g$ begin if to_regclass('public.consent_evidence') is not null then
  drop trigger if exists zz_enc_reject_plaintext on public.consent_evidence;
  create trigger zz_enc_reject_plaintext before insert or update on public.consent_evidence
    for each row execute function public.enc_reject_plaintext('payload_json', 'rendered_html', 'screenshot_segments', 'typed_word', 'user_agent');
end if; end $g$;
do $g$ begin if to_regclass('public.consent_evidence_attestations') is not null then
  drop trigger if exists zz_enc_reject_plaintext on public.consent_evidence_attestations;
  create trigger zz_enc_reject_plaintext before insert or update on public.consent_evidence_attestations
    for each row execute function public.enc_reject_plaintext('payload');
end if; end $g$;
do $g$ begin if to_regclass('public.daily_action_instances') is not null then
  drop trigger if exists zz_enc_reject_plaintext on public.daily_action_instances;
  create trigger zz_enc_reject_plaintext before insert or update on public.daily_action_instances
    for each row execute function public.enc_reject_plaintext('display_title', 'metadata', 'original_title');
end if; end $g$;
do $g$ begin if to_regclass('public.delivery_log') is not null then
  drop trigger if exists zz_enc_reject_plaintext on public.delivery_log;
  create trigger zz_enc_reject_plaintext before insert or update on public.delivery_log
    for each row execute function public.enc_reject_plaintext('error', 'recipient_mask');
end if; end $g$;
do $g$ begin if to_regclass('public.demo_access_links') is not null then
  drop trigger if exists zz_enc_reject_plaintext on public.demo_access_links;
  create trigger zz_enc_reject_plaintext before insert or update on public.demo_access_links
    for each row execute function public.enc_reject_plaintext('guest_name', 'reason');
end if; end $g$;
do $g$ begin if to_regclass('public.enrollments') is not null then
  drop trigger if exists zz_enc_reject_plaintext on public.enrollments;
  create trigger zz_enc_reject_plaintext before insert or update on public.enrollments
    for each row execute function public.enc_reject_plaintext('granted_reason');
end if; end $g$;
do $g$ begin if to_regclass('public.error_events') is not null then
  drop trigger if exists zz_enc_reject_plaintext on public.error_events;
  create trigger zz_enc_reject_plaintext before insert or update on public.error_events
    for each row execute function public.enc_reject_plaintext('stack', 'tags');
end if; end $g$;
do $g$ begin if to_regclass('public.gideon_outbox') is not null then
  drop trigger if exists zz_enc_reject_plaintext on public.gideon_outbox;
  create trigger zz_enc_reject_plaintext before insert or update on public.gideon_outbox
    for each row execute function public.enc_reject_plaintext('buttons', 'chat_id', 'reason', 'text');
end if; end $g$;
do $g$ begin if to_regclass('public.gideon_settings') is not null then
  drop trigger if exists zz_enc_reject_plaintext on public.gideon_settings;
  create trigger zz_enc_reject_plaintext before insert or update on public.gideon_settings
    for each row execute function public.enc_reject_plaintext('recipients');
end if; end $g$;
do $g$ begin if to_regclass('public.gideon_telegram_identities') is not null then
  drop trigger if exists zz_enc_reject_plaintext on public.gideon_telegram_identities;
  create trigger zz_enc_reject_plaintext before insert or update on public.gideon_telegram_identities
    for each row execute function public.enc_reject_plaintext('reason');
end if; end $g$;
do $g$ begin if to_regclass('public.guardian_sos_events') is not null then
  drop trigger if exists zz_enc_reject_plaintext on public.guardian_sos_events;
  create trigger zz_enc_reject_plaintext before insert or update on public.guardian_sos_events
    for each row execute function public.enc_reject_plaintext('metadata', 'strategy_offered', 'trigger');
end if; end $g$;
do $g$ begin if to_regclass('public.guide_access_grants') is not null then
  drop trigger if exists zz_enc_reject_plaintext on public.guide_access_grants;
  create trigger zz_enc_reject_plaintext before insert or update on public.guide_access_grants
    for each row execute function public.enc_reject_plaintext('granted_reason', 'signal_text');
end if; end $g$;
do $g$ begin if to_regclass('public.ip_blocks') is not null then
  drop trigger if exists zz_enc_reject_plaintext on public.ip_blocks;
  create trigger zz_enc_reject_plaintext before insert or update on public.ip_blocks
    for each row execute function public.enc_reject_plaintext('note', 'reason');
end if; end $g$;
do $g$ begin if to_regclass('public.journey_next_step_cache') is not null then
  drop trigger if exists zz_enc_reject_plaintext on public.journey_next_step_cache;
  create trigger zz_enc_reject_plaintext before insert or update on public.journey_next_step_cache
    for each row execute function public.enc_reject_plaintext('recommendation');
end if; end $g$;
do $g$ begin if to_regclass('public.journey_progress') is not null then
  drop trigger if exists zz_enc_reject_plaintext on public.journey_progress;
  create trigger zz_enc_reject_plaintext before insert or update on public.journey_progress
    for each row execute function public.enc_reject_plaintext('game_answers', 'habit_meta', 'habits_progress', 'quiz_answers', 'task_level_meta');
end if; end $g$;
do $g$ begin if to_regclass('public.journey_task_executions') is not null then
  drop trigger if exists zz_enc_reject_plaintext on public.journey_task_executions;
  create trigger zz_enc_reject_plaintext before insert or update on public.journey_task_executions
    for each row execute function public.enc_reject_plaintext('note');
end if; end $g$;
do $g$ begin if to_regclass('public.legal_access_log') is not null then
  drop trigger if exists zz_enc_reject_plaintext on public.legal_access_log;
  create trigger zz_enc_reject_plaintext before insert or update on public.legal_access_log
    for each row execute function public.enc_reject_plaintext('detail');
end if; end $g$;
do $g$ begin if to_regclass('public.legal_export_secrets') is not null then
  drop trigger if exists zz_enc_reject_plaintext on public.legal_export_secrets;
  create trigger zz_enc_reject_plaintext before insert or update on public.legal_export_secrets
    for each row execute function public.enc_reject_plaintext('case_ref', 'file_name', 'label', 'subject');
end if; end $g$;
do $g$ begin if to_regclass('public.lesson_progress') is not null then
  drop trigger if exists zz_enc_reject_plaintext on public.lesson_progress;
  create trigger zz_enc_reject_plaintext before insert or update on public.lesson_progress
    for each row execute function public.enc_reject_plaintext('habit_progress', 'task_progress');
end if; end $g$;
do $g$ begin if to_regclass('public.media_receipts') is not null then
  drop trigger if exists zz_enc_reject_plaintext on public.media_receipts;
  create trigger zz_enc_reject_plaintext before insert or update on public.media_receipts
    for each row execute function public.enc_reject_plaintext('attachments', 'confirmation_code', 'confirmation_link', 'original_from', 'subject');
end if; end $g$;
do $g$ begin if to_regclass('public.notification_fall_episodes') is not null then
  drop trigger if exists zz_enc_reject_plaintext on public.notification_fall_episodes;
  create trigger zz_enc_reject_plaintext before insert or update on public.notification_fall_episodes
    for each row execute function public.enc_reject_plaintext('metadata', 'reason_summary');
end if; end $g$;
do $g$ begin if to_regclass('public.notification_logs') is not null then
  drop trigger if exists zz_enc_reject_plaintext on public.notification_logs;
  create trigger zz_enc_reject_plaintext before insert or update on public.notification_logs
    for each row execute function public.enc_reject_plaintext('body', 'metadata', 'task_name');
end if; end $g$;
do $g$ begin if to_regclass('public.notifications') is not null then
  drop trigger if exists zz_enc_reject_plaintext on public.notifications;
  create trigger zz_enc_reject_plaintext before insert or update on public.notifications
    for each row execute function public.enc_reject_plaintext('body', 'metadata', 'title');
end if; end $g$;
do $g$ begin if to_regclass('public.notify_quality_events') is not null then
  drop trigger if exists zz_enc_reject_plaintext on public.notify_quality_events;
  create trigger zz_enc_reject_plaintext before insert or update on public.notify_quality_events
    for each row execute function public.enc_reject_plaintext('after_text', 'before_text');
end if; end $g$;
do $g$ begin if to_regclass('public.notify_style_rules') is not null then
  drop trigger if exists zz_enc_reject_plaintext on public.notify_style_rules;
  create trigger zz_enc_reject_plaintext before insert or update on public.notify_style_rules
    for each row execute function public.enc_reject_plaintext('avoid', 'prefer');
end if; end $g$;
do $g$ begin if to_regclass('public.ops_admin_notifications') is not null then
  drop trigger if exists zz_enc_reject_plaintext on public.ops_admin_notifications;
  create trigger zz_enc_reject_plaintext before insert or update on public.ops_admin_notifications
    for each row execute function public.enc_reject_plaintext('body', 'metadata', 'title');
end if; end $g$;
do $g$ begin if to_regclass('public.ops_login_requests') is not null then
  drop trigger if exists zz_enc_reject_plaintext on public.ops_login_requests;
  create trigger zz_enc_reject_plaintext before insert or update on public.ops_login_requests
    for each row execute function public.enc_reject_plaintext('label', 'location');
end if; end $g$;
do $g$ begin if to_regclass('public.ops_security_events') is not null then
  drop trigger if exists zz_enc_reject_plaintext on public.ops_security_events;
  create trigger zz_enc_reject_plaintext before insert or update on public.ops_security_events
    for each row execute function public.enc_reject_plaintext('detail');
end if; end $g$;
do $g$ begin if to_regclass('public.ops_trusted_devices') is not null then
  drop trigger if exists zz_enc_reject_plaintext on public.ops_trusted_devices;
  create trigger zz_enc_reject_plaintext before insert or update on public.ops_trusted_devices
    for each row execute function public.enc_reject_plaintext('browser', 'countries_seen', 'label', 'last_country', 'last_ip_masked');
end if; end $g$;
do $g$ begin if to_regclass('public.pending_almog_commitment_jobs') is not null then
  drop trigger if exists zz_enc_reject_plaintext on public.pending_almog_commitment_jobs;
  create trigger zz_enc_reject_plaintext before insert or update on public.pending_almog_commitment_jobs
    for each row execute function public.enc_reject_plaintext('assistant_message', 'habit_title_to_id', 'habit_titles', 'last_error', 'rolling_summary', 'user_message');
end if; end $g$;
do $g$ begin if to_regclass('public.pending_chat_logs') is not null then
  drop trigger if exists zz_enc_reject_plaintext on public.pending_chat_logs;
  create trigger zz_enc_reject_plaintext before insert or update on public.pending_chat_logs
    for each row execute function public.enc_reject_plaintext('raw_chat_text');
end if; end $g$;
do $g$ begin if to_regclass('public.periodic_summaries') is not null then
  drop trigger if exists zz_enc_reject_plaintext on public.periodic_summaries;
  create trigger zz_enc_reject_plaintext before insert or update on public.periodic_summaries
    for each row execute function public.enc_reject_plaintext('ai_insight', 'metrics');
end if; end $g$;
do $g$ begin if to_regclass('public.profiles') is not null then
  drop trigger if exists zz_enc_reject_plaintext on public.profiles;
  create trigger zz_enc_reject_plaintext before insert or update on public.profiles
    for each row execute function public.enc_reject_plaintext('activity_level', 'ai_context', 'ai_system_prompt', 'avatar_url', 'current_weight_kg', 'daily_task', 'dietary_preferences', 'full_name', 'gender', 'goal_weight_kg', 'health_conditions', 'height_cm', 'main_goal', 'main_obstacle', 'main_obstacle_detail', 'meal_schedule', 'pending_ai_proposal', 'phone', 'safety_screening', 'weakest_time_of_day');
end if; end $g$;
do $g$ begin if to_regclass('public.safety_events') is not null then
  drop trigger if exists zz_enc_reject_plaintext on public.safety_events;
  create trigger zz_enc_reject_plaintext before insert or update on public.safety_events
    for each row execute function public.enc_reject_plaintext('category', 'severity');
end if; end $g$;
do $g$ begin if to_regclass('public.scheduled_reminders') is not null then
  drop trigger if exists zz_enc_reject_plaintext on public.scheduled_reminders;
  create trigger zz_enc_reject_plaintext before insert or update on public.scheduled_reminders
    for each row execute function public.enc_reject_plaintext('body', 'metadata', 'title');
end if; end $g$;
do $g$ begin if to_regclass('public.security_incidents') is not null then
  drop trigger if exists zz_enc_reject_plaintext on public.security_incidents;
  create trigger zz_enc_reject_plaintext before insert or update on public.security_incidents
    for each row execute function public.enc_reject_plaintext('actions');
end if; end $g$;
do $g$ begin if to_regclass('public.security_signals') is not null then
  drop trigger if exists zz_enc_reject_plaintext on public.security_signals;
  create trigger zz_enc_reject_plaintext before insert or update on public.security_signals
    for each row execute function public.enc_reject_plaintext('country', 'path');
end if; end $g$;
do $g$ begin if to_regclass('public.stepup_requests') is not null then
  drop trigger if exists zz_enc_reject_plaintext on public.stepup_requests;
  create trigger zz_enc_reject_plaintext before insert or update on public.stepup_requests
    for each row execute function public.enc_reject_plaintext('approver_device_label', 'requester_city', 'requester_label');
end if; end $g$;
do $g$ begin if to_regclass('public.task_definitions') is not null then
  drop trigger if exists zz_enc_reject_plaintext on public.task_definitions;
  create trigger zz_enc_reject_plaintext before insert or update on public.task_definitions
    for each row execute function public.enc_reject_plaintext_owned('owner_user_id', 'description', 'ladder', 'schedule', 'title');
end if; end $g$;
do $g$ begin if to_regclass('public.task_events') is not null then
  drop trigger if exists zz_enc_reject_plaintext on public.task_events;
  create trigger zz_enc_reject_plaintext before insert or update on public.task_events
    for each row execute function public.enc_reject_plaintext('metadata', 'reason');
end if; end $g$;
do $g$ begin if to_regclass('public.task_logs') is not null then
  drop trigger if exists zz_enc_reject_plaintext on public.task_logs;
  create trigger zz_enc_reject_plaintext before insert or update on public.task_logs
    for each row execute function public.enc_reject_plaintext('task_name');
end if; end $g$;
do $g$ begin if to_regclass('public.tg_action_nonces') is not null then
  drop trigger if exists zz_enc_reject_plaintext on public.tg_action_nonces;
  create trigger zz_enc_reject_plaintext before insert or update on public.tg_action_nonces
    for each row execute function public.enc_reject_plaintext('country');
end if; end $g$;
do $g$ begin if to_regclass('public.user_consents') is not null then
  drop trigger if exists zz_enc_reject_plaintext on public.user_consents;
  create trigger zz_enc_reject_plaintext before insert or update on public.user_consents
    for each row execute function public.enc_reject_plaintext('metadata');
end if; end $g$;
do $g$ begin if to_regclass('public.user_insights') is not null then
  drop trigger if exists zz_enc_reject_plaintext on public.user_insights;
  create trigger zz_enc_reject_plaintext before insert or update on public.user_insights
    for each row execute function public.enc_reject_plaintext('insight_text', 'metadata');
end if; end $g$;
do $g$ begin if to_regclass('public.user_journey_step_unlocks') is not null then
  drop trigger if exists zz_enc_reject_plaintext on public.user_journey_step_unlocks;
  create trigger zz_enc_reject_plaintext before insert or update on public.user_journey_step_unlocks
    for each row execute function public.enc_reject_plaintext('reason');
end if; end $g$;
do $g$ begin if to_regclass('public.user_measurements') is not null then
  drop trigger if exists zz_enc_reject_plaintext on public.user_measurements;
  create trigger zz_enc_reject_plaintext before insert or update on public.user_measurements
    for each row execute function public.enc_reject_plaintext('bmi', 'height_cm', 'notes', 'weight_kg');
end if; end $g$;
do $g$ begin if to_regclass('public.user_memories') is not null then
  drop trigger if exists zz_enc_reject_plaintext on public.user_memories;
  create trigger zz_enc_reject_plaintext before insert or update on public.user_memories
    for each row execute function public.enc_reject_plaintext('memory_text');
end if; end $g$;
do $g$ begin if to_regclass('public.user_memory_dossier') is not null then
  drop trigger if exists zz_enc_reject_plaintext on public.user_memory_dossier;
  create trigger zz_enc_reject_plaintext before insert or update on public.user_memory_dossier
    for each row execute function public.enc_reject_plaintext('coaching_profile', 'essentials', 'goals', 'habit_memory', 'health_context', 'inferred_insights', 'personal_context', 'psychology', 'risk_signals', 'schedule_memory', 'tags', 'task_memory');
end if; end $g$;
do $g$ begin if to_regclass('public.user_mentorship_strategy') is not null then
  drop trigger if exists zz_enc_reject_plaintext on public.user_mentorship_strategy;
  create trigger zz_enc_reject_plaintext before insert or update on public.user_mentorship_strategy
    for each row execute function public.enc_reject_plaintext('active_blockers', 'current_focus', 'medical_red_flags', 'next_best_action', 'psychological_approach');
end if; end $g$;
do $g$ begin if to_regclass('public.user_plans') is not null then
  drop trigger if exists zz_enc_reject_plaintext on public.user_plans;
  create trigger zz_enc_reject_plaintext before insert or update on public.user_plans
    for each row execute function public.enc_reject_plaintext('description', 'plan_data', 'title');
end if; end $g$;
do $g$ begin if to_regclass('public.user_task_assignments') is not null then
  drop trigger if exists zz_enc_reject_plaintext on public.user_task_assignments;
  create trigger zz_enc_reject_plaintext before insert or update on public.user_task_assignments
    for each row execute function public.enc_reject_plaintext('reason');
end if; end $g$;
