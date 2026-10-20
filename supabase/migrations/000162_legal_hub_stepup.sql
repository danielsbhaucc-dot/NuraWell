-- Legal hub: cross-device step-up (QR → phone Face ID), admin TOTP, step-up grants,
-- confirmed receipt↔asset links, fuzzy (trigram) search indexes.

create table if not exists public.stepup_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  purpose text not null check (purpose ~ '^[a-z0-9_.:-]{2,64}$'),
  requester_binding_hash text not null,          -- sha256 of an httpOnly cookie secret held by the requesting browser
  approve_token_hash text not null,               -- sha256 of the secret inside the QR (phone side)
  requester_device_id uuid,                       -- the approved Ops device that asked (device gate already passed)
  requester_label text,
  status text not null default 'pending' check (status in ('pending','approved','denied','consumed','expired')),
  method text check (method in ('phone_passkey','passkey','totp','backup_code')),
  approver_device_label text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '3 minutes',
  decided_at timestamptz,
  consumed_at timestamptz
);
create index if not exists stepup_requests_user_idx on public.stepup_requests (user_id, created_at desc);

create table if not exists public.stepup_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  purpose text not null,
  binding_hash text not null unique,             -- sha256 of httpOnly grant cookie
  method text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);
create index if not exists stepup_grants_user_idx on public.stepup_grants (user_id, expires_at desc);

create table if not exists public.admin_totp (
  user_id uuid primary key references auth.users(id) on delete cascade,
  secret_enc text not null,                      -- AES-GCM via app key, never plaintext
  confirmed_at timestamptz,
  last_step bigint not null default 0,           -- replay protection: a code's time-step is usable once
  failures int not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.media_receipt_links (
  asset_key text not null,
  receipt_id uuid not null references public.media_receipts(id) on delete cascade,
  status text not null check (status in ('confirmed','rejected')),
  confidence int not null default 0,
  decided_by uuid,
  decided_at timestamptz not null default now(),
  primary key (asset_key, receipt_id)
);

alter table public.stepup_requests enable row level security;
alter table public.stepup_grants enable row level security;
alter table public.admin_totp enable row level security;
alter table public.media_receipt_links enable row level security;
revoke all on public.stepup_requests, public.stepup_grants, public.admin_totp, public.media_receipt_links from anon, authenticated;

create extension if not exists pg_trgm;
create index if not exists media_prov_search_trgm on public.media_provenance_assets using gin (search_text gin_trgm_ops);
create index if not exists media_receipts_search_trgm on public.media_receipts using gin (search_text gin_trgm_ops);

-- Fuzzy search (typo tolerant). Service role only.
create or replace function public.legal_hub_fuzzy(p_q text, p_limit int default 30)
returns table (kind text, id text, score real)
language sql stable security definer set search_path = public, extensions as $$
  select 'asset', asset_key, greatest(word_similarity(p_q, coalesce(search_text,'')), similarity(p_q, coalesce(title,'')))
    from media_provenance_assets
   where present and (p_q <% coalesce(search_text,'') or coalesce(title,'') % p_q or search_text ilike '%'||p_q||'%')
  union all
  select 'receipt', id::text, word_similarity(p_q, coalesce(search_text,''))
    from media_receipts
   where p_q <% coalesce(search_text,'') or search_text ilike '%'||p_q||'%'
  order by 3 desc limit greatest(1, least(p_limit, 100));
$$;
revoke all on function public.legal_hub_fuzzy(text,int) from public, anon, authenticated;

-- Semantic search sync marker (non-identifying asset metadata only goes to the EU vector index).
alter table public.media_provenance_assets add column if not exists vector_synced_at timestamptz;
