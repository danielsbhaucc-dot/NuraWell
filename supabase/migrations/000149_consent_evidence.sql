-- Legal evidence for consent events: append-only, service-role only, tamper-evident (hash chain +
-- Ed25519 signature + RFC 3161 TSA + OpenTimestamps in attestations). No UPDATE/DELETE/TRUNCATE ever.
create table if not exists public.consent_evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  consent_type text not null default 'health_data',
  action text not null check (action in ('grant','withdraw')),
  source text not null,
  text_version text not null,
  rendered_html text not null,
  rendered_sha256 text not null,
  typed_word text not null,
  checkbox_checked boolean not null,
  ip_hash text,
  ip_enc text,
  user_agent text,
  session_id text,
  device_id text,
  screenshot_sha256 text,
  screenshot_storage text,
  screenshot_key text,
  screenshot_bytes int,
  payload_json text not null,
  prev_hash text not null,
  record_hash text not null unique,
  signature text not null,
  signing_key_id text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists consent_evidence_chain_uq on public.consent_evidence (user_id, prev_hash);
create index if not exists consent_evidence_user_idx on public.consent_evidence (user_id, created_at);

create table if not exists public.consent_evidence_attestations (
  id bigserial primary key,
  record_id uuid references public.consent_evidence(id),
  kind text not null check (kind in ('tsa','ots','ots_upgrade','email_receipt','chain_anchor','webauthn')),
  digest text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists consent_attest_record_idx on public.consent_evidence_attestations (record_id);
create index if not exists consent_attest_kind_idx on public.consent_evidence_attestations (kind, created_at);

create table if not exists public.consent_evidence_blobs (
  sha256 text primary key,
  user_id uuid not null,
  mime text not null,
  bytes_enc text not null,
  created_at timestamptz not null default now()
);

create or replace function public.trg_consent_evidence_append_only()
returns trigger language plpgsql as $$
begin
  raise exception 'consent evidence is append-only' using errcode = '42501';
end $$;

do $$ declare t text; begin
  foreach t in array array['consent_evidence','consent_evidence_attestations','consent_evidence_blobs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('drop trigger if exists %I on public.%I', t || '_no_mutate', t);
    execute format('create trigger %I before update or delete on public.%I for each row execute function public.trg_consent_evidence_append_only()', t || '_no_mutate', t);
    execute format('drop trigger if exists %I on public.%I', t || '_no_truncate', t);
    execute format('create trigger %I before truncate on public.%I for each statement execute function public.trg_consent_evidence_append_only()', t || '_no_truncate', t);
  end loop;
end $$;
grant select, insert on public.consent_evidence, public.consent_evidence_attestations, public.consent_evidence_blobs to service_role;
grant usage on sequence public.consent_evidence_attestations_id_seq to service_role;
