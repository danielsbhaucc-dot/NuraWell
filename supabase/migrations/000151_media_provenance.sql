-- Media provenance & legal evidence. Same guarantees as consent evidence (000149):
-- append-only evidence rows (hash chain per asset + Ed25519 + RFC 3161 + OpenTimestamps),
-- service-role only. media_provenance_assets is the mutable search index; the evidence decides.
create table if not exists public.media_provenance_assets (
  asset_key text primary key,
  origin text not null check (origin in ('repo','inline','storage','font','library')),
  kind text not null check (kind in ('image','illustration','icon','audio','video','font','file')),
  path text,
  public_url text,
  media_asset_id uuid,
  title text,
  mime text,
  bytes bigint,
  width int,
  height int,
  sha256 text,
  phash text,
  source_type text not null default 'unknown' check (source_type in
    ('in_house','stock_cc0','stock_license','ai_image','ai_music','ai_voice','font_license','library_license','owner_upload','unknown')),
  status text not null default 'missing_source' check (status in ('verified','draft','missing_source')),
  provenance jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  usages jsonb not null default '[]'::jsonb,
  missing jsonb not null default '[]'::jsonb,
  first_commit jsonb,
  last_commit jsonb,
  ai_description text,
  ai_tags text[] not null default '{}',
  ai_cost_usd numeric,
  latest_record_hash text,
  records int not null default 0,
  file_blob_sha text,
  present boolean not null default true,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists media_prov_status_idx on public.media_provenance_assets (status, source_type);

create table if not exists public.media_evidence (
  id uuid primary key default gen_random_uuid(),
  asset_key text not null,
  event text not null check (event in ('scan','provenance','license_snapshot','attachment','ai_describe','receipt','receipt_update')),
  payload_json text not null,
  prev_hash text not null,
  record_hash text not null unique,
  signature text not null,
  signing_key_id text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists media_evidence_chain_uq on public.media_evidence (asset_key, prev_hash);
create index if not exists media_evidence_asset_idx on public.media_evidence (asset_key, created_at);

create table if not exists public.media_evidence_attestations (
  id bigserial primary key,
  record_id uuid references public.media_evidence(id),
  kind text not null check (kind in ('tsa','ots','chain_anchor')),
  digest text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists media_attest_record_idx on public.media_evidence_attestations (record_id);
create index if not exists media_attest_kind_idx on public.media_evidence_attestations (kind, created_at);

create table if not exists public.media_evidence_blobs (
  sha256 text primary key,
  mime text not null,
  bytes int not null,
  storage text not null,
  storage_key text not null,
  bytes_enc text,
  created_at timestamptz not null default now()
);

create or replace function public.trg_media_evidence_append_only()
returns trigger language plpgsql as $$
begin
  raise exception 'media evidence is append-only' using errcode = '42501';
end $$;

do $$ declare t text; begin
  foreach t in array array['media_evidence','media_evidence_attestations','media_evidence_blobs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('drop trigger if exists %I on public.%I', t || '_no_mutate', t);
    execute format('create trigger %I before update or delete on public.%I for each row execute function public.trg_media_evidence_append_only()', t || '_no_mutate', t);
    execute format('drop trigger if exists %I on public.%I', t || '_no_truncate', t);
    execute format('create trigger %I before truncate on public.%I for each statement execute function public.trg_media_evidence_append_only()', t || '_no_truncate', t);
  end loop;
end $$;
alter table public.media_provenance_assets enable row level security;
revoke all on public.media_provenance_assets from public, anon, authenticated;
grant select, insert on public.media_evidence, public.media_evidence_attestations, public.media_evidence_blobs to service_role;
grant select, insert, update on public.media_provenance_assets to service_role;
grant usage on sequence public.media_evidence_attestations_id_seq to service_role;

-- Subscription receipts (inbound receipts@ mail or manual upload). Index is mutable (period edits are
-- also appended as signed 'receipt_update' evidence under asset_key 'receipt:<id>'); originals are blobs.
create table if not exists public.media_receipts (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('email','upload','gmail_confirmation')),
  vendor text not null default 'unknown',
  plan text,
  amount numeric,
  currency text,
  receipt_date date,
  period_start date,
  period_end date,
  subject text,
  original_from text,
  forwarder_ok boolean not null default false,
  dkim jsonb not null default '{}'::jsonb,
  spf text,
  trust text not null default 'review' check (trust in ('verified','review','rejected')),
  eml_sha text,
  attachments jsonb not null default '[]'::jsonb,
  confirmation_code text,
  record_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists media_receipts_vendor_idx on public.media_receipts (vendor, period_start);
alter table public.media_receipts enable row level security;
revoke all on public.media_receipts from public, anon, authenticated;
grant select, insert, update on public.media_receipts to service_role;

-- Tiny sync marker (which repo manifest hash was ingested) — lets the app ingest once per deploy, no cron.
create table if not exists public.media_scan_state (key text primary key, value text not null, updated_at timestamptz not null default now());
alter table public.media_scan_state enable row level security;
revoke all on public.media_scan_state from public, anon, authenticated;
grant select, insert, update on public.media_scan_state to service_role;
