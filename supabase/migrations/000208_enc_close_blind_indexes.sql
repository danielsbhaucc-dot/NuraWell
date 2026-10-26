-- Encryption close-out (sec/enc-close-pending): unblock the last SQL-bound sensitive columns.
-- Every change is additive / logic-preserving; the plaintext the old objects read is moved into
-- (a) HMAC blind-index columns computed by the app with a system key from env (never in the DB), or
-- (b) plain technical columns that hold no personal content (ids, enum choice).
-- The app (prepareWriteRow) fills the new columns on every write; the field backfill fills them for old rows.

-- ── 1. challenge_success_events.title: dedupe lookup by HMAC(title) ─────────────────────────────────
alter table public.challenge_success_events add column if not exists title_bidx text;
create index if not exists idx_cse_dedupe_bidx
  on public.challenge_success_events (enrollment_id, event_type, title_bidx) where title_bidx is not null;

-- ── 2. notifications.metadata: unique checkpoint scope + dedupe_key lookup by HMAC ──────────────────
alter table public.notifications add column if not exists meta_unique_bidx text;
alter table public.notifications add column if not exists meta_key_bidx text;
-- replaces idx_notifications_habit_checkpoint_dedupe (000024) / idx_notifications_check_in_dedupe (000089)
-- for enc:v2 rows; the old expression indexes stay for legacy plaintext rows until the backfill finishes.
create unique index if not exists idx_notifications_meta_unique_bidx
  on public.notifications (user_id, meta_unique_bidx) where meta_unique_bidx is not null;
create index if not exists idx_notifications_meta_key_bidx
  on public.notifications (user_id, meta_key_bidx) where meta_key_bidx is not null;

-- ── 3. user_consents.metadata: the history trigger reads plain link columns, not metadata ───────────
alter table public.user_consents add column if not exists evidence_id uuid;
alter table public.user_consents add column if not exists request_id text;
alter table public.user_consents add column if not exists choice text;
alter table public.user_consents drop constraint if exists user_consents_choice_check;
alter table public.user_consents add constraint user_consents_choice_check
  check (choice is null or choice in ('delete_now','keep_24m'));
alter table public.user_consents drop constraint if exists user_consents_request_id_len;
alter table public.user_consents add constraint user_consents_request_id_len
  check (request_id is null or char_length(request_id) <= 120);
-- one-time copy for rows still in plaintext (enc:v2 rows are strings, jsonb_typeof <> 'object')
update public.user_consents set
  evidence_id = case when (metadata->>'evidence_id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (metadata->>'evidence_id')::uuid end,
  request_id  = left(metadata->>'request_id', 120),
  choice      = case when metadata->>'choice' in ('delete_now','keep_24m') then metadata->>'choice' end
where jsonb_typeof(metadata) = 'object'
  and (metadata ? 'evidence_id' or metadata ? 'request_id' or metadata ? 'choice')
  and evidence_id is null and request_id is null and choice is null;

create or replace function public.trg_user_consents_to_history()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.consent_history (source_consent_id, user_id, consent_type, granted, policy_version, source, evidence_id, request_id, created_at, choice)
  values (
    new.id, new.user_id, new.consent_type, new.granted, new.policy_version, left(new.source, 64),
    new.evidence_id,
    left(new.request_id, 120),
    new.created_at,
    case when new.choice in ('delete_now','keep_24m') then new.choice end
  )
  on conflict (source_consent_id) do nothing;
  return new;
end $$;
revoke all on function public.trg_user_consents_to_history() from public, anon, authenticated;

-- ── 4. journey_task_executions.note: the legacy mirror no longer copies the note into task_events ───
-- task_events.legacy_ref = 'jte:<id>' already links the row; nothing reads task_events.metadata->>'note'.
create or replace function public.mirror_jte_to_task_events() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_asg uuid; v_def uuid;
begin
  v_asg := public.ensure_step_task_assignment(new.user_id, new.step_id, new.task_id);
  select definition_id into v_def from public.user_task_assignments where id = v_asg;
  insert into public.task_events (user_id, assignment_id, definition_id, kind, date_key, slot, level, source, legacy_ref, occurred_at, metadata)
  values (new.user_id, v_asg, v_def,
          case coalesce(new.outcome,'completed') when 'completed' then 'done' when 'partial' then 'partial'
               when 'attempt_failed' then 'missed' else 'skipped' end,
          new.date_key, new.slot,
          (select current_level from public.user_task_assignments where id = v_asg),
          coalesce(new.source,'legacy'), 'jte:'||new.id, coalesce(new.completed_at, now()),
          jsonb_build_object('jte_id', new.id))
  on conflict (legacy_ref) do nothing;
  return new;
end $$;
revoke execute on function public.mirror_jte_to_task_events() from public, anon, authenticated;

-- ── 5. app-only writers that were mislabelled "written by SQL": drop plaintext-only constraints ─────
-- notify_quality_events: the 400-char CHECKs move to the app (notify-quality writer slices to 400) because
-- enc:v2 ciphertext is longer than the plaintext.
alter table public.notify_quality_events drop constraint if exists notify_quality_events_before_text_check;
alter table public.notify_quality_events drop constraint if exists notify_quality_events_after_text_check;
