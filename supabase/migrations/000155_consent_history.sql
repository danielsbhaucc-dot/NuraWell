-- Pseudonymous, append-only consent history that survives account deletion.
-- user_consents is ON DELETE CASCADE from auth.users; this copy keeps only what is needed to prove a
-- consent decision (pseudonymous user id, type, decision, policy version, source, evidence link, time).
-- No email/name/IP/free-text metadata. Same append-only guard as consent_evidence. Existing user data
-- is not changed: rows are only COPIED (insert-only backfill).
create table if not exists public.consent_history (
  id bigserial primary key,
  source_consent_id uuid unique,
  user_id uuid not null, -- pseudonymous id (no FK, so it outlives the account; matches consent_evidence.user_id)
  consent_type text not null,
  granted boolean not null,
  policy_version text,
  source text,
  evidence_id uuid,
  request_id text,
  created_at timestamptz not null
);
create index if not exists consent_history_user_idx on public.consent_history (user_id, created_at);
create index if not exists consent_history_evidence_idx on public.consent_history (evidence_id);

alter table public.consent_history enable row level security;
revoke all on public.consent_history from public, anon, authenticated;
drop trigger if exists consent_history_no_mutate on public.consent_history;
create trigger consent_history_no_mutate before update or delete on public.consent_history
  for each row execute function public.trg_consent_evidence_append_only();
drop trigger if exists consent_history_no_truncate on public.consent_history;
create trigger consent_history_no_truncate before truncate on public.consent_history
  for each statement execute function public.trg_consent_evidence_append_only();
grant select, insert on public.consent_history to service_role;
grant usage on sequence public.consent_history_id_seq to service_role;

create or replace function public.trg_user_consents_to_history()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.consent_history (source_consent_id, user_id, consent_type, granted, policy_version, source, evidence_id, request_id, created_at)
  values (
    new.id, new.user_id, new.consent_type, new.granted, new.policy_version, left(new.source, 64),
    case when (new.metadata->>'evidence_id') ~ '^[0-9a-f-]{36}$' then (new.metadata->>'evidence_id')::uuid end,
    left(new.metadata->>'request_id', 120),
    new.created_at
  )
  on conflict (source_consent_id) do nothing;
  return new;
end $$;
revoke all on function public.trg_user_consents_to_history() from public, anon, authenticated;

drop trigger if exists user_consents_to_history on public.user_consents;
create trigger user_consents_to_history after insert on public.user_consents
  for each row execute function public.trg_user_consents_to_history();

-- Insert-only backfill of existing decisions (source rows untouched).
insert into public.consent_history (source_consent_id, user_id, consent_type, granted, policy_version, source, evidence_id, request_id, created_at)
select c.id, c.user_id, c.consent_type, c.granted, c.policy_version, left(c.source, 64),
       case when (c.metadata->>'evidence_id') ~ '^[0-9a-f-]{36}$' then (c.metadata->>'evidence_id')::uuid end,
       left(c.metadata->>'request_id', 120), c.created_at
from public.user_consents c
on conflict (source_consent_id) do nothing;

-- Full-sheet scroll capture: ordered segment refs (sha256 per segment is also inside the signed payload).
-- Adding a column does not touch existing rows' content (append-only trigger guards UPDATE/DELETE only).
alter table public.consent_evidence add column if not exists screenshot_segments jsonb;

-- Per-export passphrases (Ops "משפטי" → סיסמאות). Encrypted at rest with the server PII key (envelope:
-- AES-256-GCM per row); plaintext never stored or logged. Rows are deleted together with the export
-- copy after 7 days (exports/ lifecycle in the legal bucket + purge in the daily legal cron).
create table if not exists public.legal_export_secrets (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  subject text not null,
  label text not null,
  case_ref text not null,
  file_name text not null,
  format text not null,
  export_sha256 text not null,
  stored_key text,
  pw_enc text not null,
  pw_verifier jsonb not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists legal_export_secrets_exp_idx on public.legal_export_secrets (expires_at);
create index if not exists legal_export_secrets_created_idx on public.legal_export_secrets (created_at desc);
alter table public.legal_export_secrets enable row level security;
revoke all on public.legal_export_secrets from public, anon, authenticated;
grant select, insert, delete on public.legal_export_secrets to service_role;
