-- 000212 enc-close-2: move the task dedupe / merge SQL to the app + blind indexes, so task titles, ladders, reasons,
-- history and metadata can be enc:v2. No data is modified here except index/bidx plumbing (no prod text rewritten).
--  1. user_task_assignments.reason: a user's own reason for a shared guide task (was written into the SHARED guide
--     definition's description by offerGuideTask; the app now writes it here, sealed under the user's DEK).
--  2. task_definitions.title_bidx = HMAC(dedupe_normalize(normalize_task_title(title))) (app/backfill) feeds
--     habit_dedupe_key; legacy rows without it keep md5(dedupe_normalize(title)) until backfilled.
--     almog_assignments.title_tok_bidx = HMAC per title token feeds the similar-title trigger.
--     chat_task_proposals.title_bidx replaces the unique index on lower(title).
--     admin_audit_log.ip_bidx = HMAC(ip) for equality lookups once ip is enc:v2.
--  3. normalize_task_title triggers skip enc:v values (the app normalizes before sealing).
--  4. task_dup_candidates() / merge_task_assignments() dropped (lib/almog/task-dup-candidates.ts); the slim
--     merge_task_assignment_state() moves ids/levels/statuses only.
--  5. mirror_jte_to_task_events() stops writing metadata (legacy_ref 'jte:<id>' already carries the link).
--  6. Fixed-code columns stay plaintext: almog_interventions.barrier_type gets the CHECK the app already enforces
--     (FRICTION_CATEGORIES, NOT VALID so legacy rows are untouched). chat_task_proposals length CHECK moves to the app.
--  7. enc_reject_plaintext_owned(owner_col, cols...): owner-optional tables (task_definitions) check owned rows only.

-- ── 1 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.user_task_assignments add column if not exists reason text;

-- ── 2 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.task_definitions add column if not exists title_bidx text;
alter table public.almog_assignments add column if not exists title_tok_bidx text[];
alter table public.chat_task_proposals add column if not exists title_bidx text;
alter table public.admin_audit_log add column if not exists ip_bidx text;
create index if not exists admin_audit_log_ip_bidx_idx on public.admin_audit_log (ip_bidx, created_at desc) where ip_bidx is not null;
create index if not exists almog_assignments_title_tok_bidx_gin on public.almog_assignments using gin (title_tok_bidx) where status = 'active';

drop index if exists public.chat_task_proposals_user_title_open;
-- legacy plaintext rows (title_bidx NULL) stay covered by the lower(title) arm until backfilled
create unique index if not exists chat_task_proposals_user_title_bidx_open on public.chat_task_proposals (user_id, title_bidx)
  where status in ('pending','shown') and title_bidx is not null;
create unique index if not exists chat_task_proposals_user_title_legacy_open on public.chat_task_proposals (user_id, lower(title))
  where status in ('pending','shown') and title_bidx is null and title !~ '^enc:v';
alter table public.chat_task_proposals drop constraint if exists chat_task_proposals_title_check;

create or replace function public.uta_set_dedupe_key() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_key text;
begin
  select coalesce(d.title_bidx, md5(public.dedupe_normalize(d.title))) into v_key from public.task_definitions d where d.id = new.definition_id;
  new.habit_dedupe_key := v_key;
  -- a second live copy of the same habit is archived instead of failing legacy writers
  if new.status in ('accepted','offered','paused') and exists (
    select 1 from public.user_task_assignments a
    where a.user_id = new.user_id and a.habit_dedupe_key = v_key and a.id <> new.id
      and a.status in ('accepted','offered','paused')
  ) then
    new.status := 'archived';
  end if;
  return new;
end $$;
revoke execute on function public.uta_set_dedupe_key() from public, anon, authenticated;

-- a definition whose title_bidx is (back)filled re-keys its assignments; a resulting live duplicate is archived
create or replace function public.task_definitions_rekey_trg() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare r record;
begin
  if new.title_bidx is null or new.title_bidx is not distinct from old.title_bidx then return new; end if;
  for r in select a.id, a.user_id, a.status from public.user_task_assignments a where a.definition_id = new.id loop
    if r.status in ('accepted','offered','paused') and exists (
      select 1 from public.user_task_assignments b
      where b.user_id = r.user_id and b.habit_dedupe_key = new.title_bidx and b.id <> r.id and b.status in ('accepted','offered','paused')
    ) then
      update public.user_task_assignments set status = 'archived', is_main = false, updated_at = now() where id = r.id;
    else
      update public.user_task_assignments set habit_dedupe_key = new.title_bidx where id = r.id;
    end if;
  end loop;
  return new;
end $$;
revoke execute on function public.task_definitions_rekey_trg() from public, anon, authenticated;
drop trigger if exists trg_task_definitions_rekey on public.task_definitions;
create trigger trg_task_definitions_rekey after update of title_bidx on public.task_definitions
  for each row execute function public.task_definitions_rekey_trg();

create or replace function public.nw_tokens_similar(ta text[], tb text[])
returns boolean language plpgsql immutable set search_path to 'pg_catalog', 'public' as $$
declare i int; u int; sm int;
begin
  if coalesce(cardinality(ta), 0) = 0 or coalesce(cardinality(tb), 0) = 0 then return false; end if;
  select count(*) into i from unnest(ta) x where x = any(tb);
  u := cardinality(ta) + cardinality(tb) - i;
  sm := least(cardinality(ta), cardinality(tb));
  return (i::numeric / u) >= 0.72 or (i::numeric / sm) >= 0.85;
end $$;

create or replace function public.almog_assignments_block_similar_trg()
returns trigger language plpgsql set search_path to 'public', 'pg_temp' as $$
begin
  -- 'eases' rows are structural (keyed by a unique dedupe_key) and exempt. Token HMACs when both rows have them,
  -- the plaintext token rule only when neither title is ciphertext.
  if new.status = 'active' and coalesce(new.relation, 'standalone') <> 'eases' and exists (
    select 1 from public.almog_assignments a
    where a.user_id = new.user_id and a.status = 'active' and a.id <> new.id
      and case
        when a.title_tok_bidx is not null and new.title_tok_bidx is not null then public.nw_tokens_similar(a.title_tok_bidx, new.title_tok_bidx)
        when a.title !~ '^enc:v' and new.title !~ '^enc:v' then public.nw_titles_similar(a.title, new.title)
        else false end
  ) then
    raise exception 'similar active assignment exists' using errcode = '23505';
  end if;
  return new;
end $$;

-- ── 3 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.task_title_normalize_trg() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.title is not null and new.title !~ '^enc:v' then new.title := public.normalize_task_title(new.title); end if;
  return new;
end $$;
revoke execute on function public.task_title_normalize_trg() from public, anon, authenticated;

-- ── 4 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
drop function if exists public.task_dup_candidates(int);
drop function if exists public.merge_task_assignments(uuid, uuid, uuid[], text, int);

create or replace function public.merge_task_assignment_state(p_user uuid, p_keep uuid, p_drop uuid[], p_level int)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare k record; n int; refs text[];
begin
  select u.* into k from public.user_task_assignments u
  where u.id = p_keep and u.user_id = p_user and u.status = 'accepted' for update;
  if not found then raise exception 'keep task not found'; end if;
  p_drop := array(select x from unnest(p_drop) x where x <> p_keep);
  select count(*) into n from public.user_task_assignments u where u.id = any(p_drop) and u.user_id = p_user and u.status = 'accepted';
  if n is distinct from cardinality(p_drop) or n = 0 then raise exception 'drop tasks invalid'; end if;
  if p_level is null then raise exception 'level required'; end if;

  update public.user_task_assignments set
    current_level = p_level,
    last_level_change_at = case when p_level <> k.current_level then now() else last_level_change_at end,
    is_main = k.is_main or exists (select 1 from public.user_task_assignments where id = any(p_drop) and is_main),
    updated_at = now()
  where id = p_keep;
  update public.task_events set assignment_id = p_keep where assignment_id = any(p_drop);
  update public.user_task_assignments set status = 'archived', is_main = false, updated_at = now() where id = any(p_drop);
  with d as (
    update public.almog_assignments a set status = 'dropped'
    where a.user_id = p_user and a.status = 'active'
      and a.id::text in (select legacy_ref from public.user_task_assignments where id = any(p_drop) and legacy_ref is not null)
    returning a.id::text id)
  select coalesce(array_agg(id), '{}') into refs from d;
  return jsonb_build_object('n', n, 'from_level', k.current_level, 'to_level', p_level, 'definition_id', k.definition_id, 'dropped_almog', to_jsonb(refs));
end $$;
revoke all on function public.merge_task_assignment_state(uuid, uuid, uuid[], int) from public, anon, authenticated;
grant execute on function public.merge_task_assignment_state(uuid, uuid, uuid[], int) to service_role;

-- ── 5 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.mirror_jte_to_task_events() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_asg uuid; v_def uuid;
begin
  v_asg := public.ensure_step_task_assignment(new.user_id, new.step_id, new.task_id);
  select definition_id into v_def from public.user_task_assignments where id = v_asg;
  insert into public.task_events (user_id, assignment_id, definition_id, kind, date_key, slot, level, source, legacy_ref, occurred_at)
  values (new.user_id, v_asg, v_def,
          case coalesce(new.outcome,'completed') when 'completed' then 'done' when 'partial' then 'partial'
               when 'attempt_failed' then 'missed' else 'skipped' end,
          new.date_key, new.slot,
          (select current_level from public.user_task_assignments where id = v_asg),
          coalesce(new.source,'legacy'), 'jte:'||new.id, coalesce(new.completed_at, now()))
  on conflict (legacy_ref) do nothing;
  return new;
end $$;
revoke execute on function public.mirror_jte_to_task_events() from public, anon, authenticated;

-- ── 6 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.almog_interventions drop constraint if exists almog_interventions_barrier_type_check;
alter table public.almog_interventions add constraint almog_interventions_barrier_type_check
  check (barrier_type in ('logistical','physiological','cognitive','emotional','social','knowledge','motivational')) not valid;
-- fixed-code columns kept plaintext: new writes must stay inside the code set (NOT VALID: legacy rows untouched)
alter table public.chat_sessions drop constraint if exists chat_sessions_topic_code;
alter table public.chat_sessions add constraint chat_sessions_topic_code
  check (topic is null or topic in ('habits','emotions','nutrition','sleep','journey','general')) not valid;
alter table public.almog_assignments drop constraint if exists almog_assignments_schedule_code;
alter table public.almog_assignments add constraint almog_assignments_schedule_code
  check (schedule is null or schedule in ('one_time','daily','weekly')) not valid;

-- ── 7 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.enc_reject_plaintext_owned() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  c text;
  i int;
  owner text := tg_argv[0];
  nj jsonb;
  oj jsonb;
begin
  if not coalesce((select e.active from public.field_enc_enforcement e where e.table_name = tg_table_name), false) then
    return new;
  end if;
  nj := to_jsonb(new);
  if tg_op = 'UPDATE' then oj := to_jsonb(old); end if;
  -- shared catalog rows (no owner, before and after) are not personal and stay plaintext
  if coalesce(nj ->> owner, '') = '' and (oj is null or coalesce(oj ->> owner, '') = '') then return new; end if;
  for i in 1 .. tg_nargs - 1 loop
    c := tg_argv[i];
    if tg_op = 'UPDATE' and (nj -> c) is not distinct from (oj -> c) and (nj -> owner) is not distinct from (oj -> owner) then continue; end if;
    if not public.enc_value_ok(nj -> c) then
      raise exception 'enc_reject_plaintext: plaintext write to encrypted column %.% rejected', tg_table_name, c
        using errcode = '22023', hint = 'write through the field-encryption wrapper (lib/security/field-fetch.ts)';
    end if;
  end loop;
  return new;
end $$;
revoke all on function public.enc_reject_plaintext_owned() from public, anon, authenticated;

-- ── generated: per-table reject triggers (registry 2026-10-26 enc-close-2) ──────────────────────────────────────────
-- enc-reject-triggers: generated by apps/web/scripts/gen-enc-triggers.mts — do not edit
-- spec {"admin_audit_log":["ip"],"ai_interaction_edits":["edited_content","original_content"],"ai_interactions":["content","metadata"],"almog_assignments":["detail","history","metadata","reason","source_excerpt","title"],"almog_blockers":["current_options","description","history","metadata","strategy"],"almog_focus_periods":["metadata","reason"],"almog_interventions":["metadata","strategy"],"almog_kickoff_status":["last_error","skip_reason"],"billing_events":["metadata"],"ceo_audit_log":["detail"],"ceo_conversations":["summary","turns"],"ceo_dev_forwards":["body","error","or_notes","source_text","title"],"ceo_owner_tasks":["detail","title"],"ceo_pending_actions":["args","result","summary"],"challenge_admin_audit_log":["payload","summary"],"challenge_enrollments":["completion_summary","eating_window","metadata"],"challenge_interview_sessions":["extracted_insights","transcript"],"challenge_success_events":["description","evidence","title"],"challenge_task_completions":["metadata"],"chat_periodic_summaries":["ai_insight","metrics"],"chat_sessions":["live_conversation_file","preview_text","summary","title"],"chat_task_proposals":["reason","title"],"chat_transcript_access_requests":["admin_note","reason","user_response_note"],"chat_transcript_admin_audit_log":["payload","reason","summary"],"churn_feedback":["detail"],"consent_evidence":["payload_json","rendered_html","screenshot_segments","typed_word","user_agent"],"consent_evidence_attestations":["payload"],"daily_action_instances":["display_title","metadata","original_title"],"delivery_log":["error","recipient_mask"],"demo_access_links":["guest_name","reason"],"enrollments":["granted_reason"],"error_events":["stack","tags"],"gideon_outbox":["buttons","chat_id","reason","text"],"gideon_settings":["recipients"],"gideon_telegram_identities":["reason"],"guardian_sos_events":["metadata","strategy_offered","trigger"],"guide_access_grants":["granted_reason","signal_text"],"ip_blocks":["note","reason"],"journey_next_step_cache":["recommendation"],"journey_progress":["game_answers","habit_meta","habits_progress","quiz_answers","task_level_meta"],"journey_task_executions":["note"],"legal_access_log":["detail"],"legal_export_secrets":["case_ref","file_name","label","subject"],"lesson_progress":["habit_progress","task_progress"],"media_receipts":["attachments","confirmation_code","confirmation_link","original_from","subject"],"notification_fall_episodes":["metadata","reason_summary"],"notification_logs":["body","metadata","task_name"],"notifications":["body","metadata","title"],"notify_quality_events":["after_text","before_text"],"notify_style_rules":["avoid","prefer"],"ops_admin_notifications":["body","metadata","title"],"ops_login_requests":["label","location"],"ops_trusted_devices":["browser","countries_seen","label","last_country","last_ip_masked"],"pending_almog_commitment_jobs":["assistant_message","habit_title_to_id","habit_titles","last_error","rolling_summary","user_message"],"pending_chat_logs":["raw_chat_text"],"periodic_summaries":["ai_insight","metrics"],"profiles":["activity_level","ai_context","ai_system_prompt","avatar_url","current_weight_kg","daily_task","dietary_preferences","full_name","gender","goal_weight_kg","health_conditions","height_cm","main_goal","main_obstacle","main_obstacle_detail","meal_schedule","pending_ai_proposal","phone","safety_screening","weakest_time_of_day"],"safety_events":["category","severity"],"scheduled_reminders":["body","metadata","title"],"security_incidents":["actions"],"security_signals":["country","path"],"stepup_requests":["approver_device_label","requester_city","requester_label"],"task_definitions":["description","ladder","schedule","title"],"task_events":["metadata","reason"],"task_logs":["task_name"],"tg_action_nonces":["country"],"user_consents":["metadata"],"user_insights":["insight_text","metadata"],"user_journey_step_unlocks":["reason"],"user_measurements":["bmi","height_cm","notes","weight_kg"],"user_memories":["memory_text"],"user_memory_dossier":["coaching_profile","essentials","goals","habit_memory","health_context","inferred_insights","personal_context","psychology","risk_signals","schedule_memory","tags","task_memory"],"user_mentorship_strategy":["active_blockers","current_focus","medical_red_flags","next_best_action","psychological_approach"],"user_plans":["description","plan_data","title"],"user_task_assignments":["reason"]}

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
    for each row execute function public.enc_reject_plaintext('ip');
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
