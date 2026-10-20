-- Owner privacy-compliance checklist (Ops → פרטיות). Service-role only; no client access.
create table if not exists public.owner_compliance_status (
  item_key text primary key check (item_key ~ '^[a-z0-9_.:-]{1,80}$'),
  done boolean not null default false,
  done_at timestamptz,
  meta jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text
);
alter table public.owner_compliance_status enable row level security;
revoke all on public.owner_compliance_status from anon, authenticated;

-- Internal compliance documents (incl. confidential vendor list). Bytes live here, never in the public repo or static files.
create table if not exists public.owner_compliance_docs (
  slug text primary key check (slug ~ '^[0-9]{2}-[a-z0-9-]+\.(pdf|docx)$'),
  title text not null,
  mime text not null,
  content bytea not null,
  sha256 text not null,
  sensitive boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.owner_compliance_docs enable row level security;
revoke all on public.owner_compliance_docs from anon, authenticated;
