-- Justification-gated PII access (product-agnostic): a written reason buys a short grant for ONE subject.
-- Every grant and every view is written to an append-only log (no update/delete, even for service_role).
create table if not exists public.pii_access_grants (
  id uuid primary key default gen_random_uuid(),
  product_id text not null default 'nurawell' references public.iam_products(id),
  actor_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid not null,
  reason text not null check (char_length(reason) between 15 and 500),
  ticket_ref text check (ticket_ref is null or ticket_ref ~ '^[A-Za-z0-9#._-]{2,40}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null check (expires_at <= created_at + interval '60 minutes'),
  revoked_at timestamptz,
  ip_hash text, country text, device_id uuid
);
create index if not exists idx_pii_grants_lookup on public.pii_access_grants(actor_id, subject_id, expires_at desc);

create table if not exists public.pii_access_log (
  id bigint generated always as identity primary key,
  product_id text not null default 'nurawell' references public.iam_products(id),
  at timestamptz not null default now(),
  actor_id uuid not null,
  subject_id uuid,
  grant_id uuid,
  event text not null check (event in ('grant','view','denied','revoke')),
  resource text not null default '',
  ip_hash text, country text, device_id uuid
);
create index if not exists idx_pii_access_log_at on public.pii_access_log(at desc);

create or replace function public.pii_access_log_immutable() returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'pii_access_log is append-only'; end $$;
drop trigger if exists trg_pii_access_log_immutable on public.pii_access_log;
create trigger trg_pii_access_log_immutable before update or delete on public.pii_access_log
  for each row execute function public.pii_access_log_immutable();
-- truncate too
drop trigger if exists trg_pii_access_log_no_truncate on public.pii_access_log;
create trigger trg_pii_access_log_no_truncate before truncate on public.pii_access_log
  for each statement execute function public.pii_access_log_immutable();

do $$ declare t text; begin
  foreach t in array array['pii_access_grants','pii_access_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;
revoke update, delete, truncate on public.pii_access_log from service_role;
