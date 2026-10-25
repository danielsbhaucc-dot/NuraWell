-- Nightly AI access audit: one row per run (counts + cost) and pseudonymous findings for the ops security area.
create table if not exists public.access_audit_runs (
  id uuid primary key default gen_random_uuid(),
  product_id text not null default 'nurawell' references public.iam_products(id),
  started_at timestamptz not null default now(),
  window_from timestamptz not null,
  window_to timestamptz not null,
  events int not null default 0,
  flagged int not null default 0,
  model_called boolean not null default false,
  findings int not null default 0,
  error text
);
create table if not exists public.access_audit_findings (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.access_audit_runs(id) on delete cascade,
  product_id text not null default 'nurawell' references public.iam_products(id),
  created_at timestamptz not null default now(),
  severity text not null check (severity in ('low','medium','high')),
  signals text[] not null default '{}',
  summary text not null check (char_length(summary) <= 400),
  event_kind text not null,
  event_at timestamptz,
  actor_id uuid,
  acknowledged_at timestamptz
);
create index if not exists idx_access_audit_findings_open on public.access_audit_findings(created_at desc) where acknowledged_at is null;
do $$ declare t text; begin
  foreach t in array array['access_audit_runs','access_audit_findings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;
