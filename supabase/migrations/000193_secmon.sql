-- Platform security monitor (product-agnostic): heartbeats for every automated security run (dead-man switch)
-- and deduped findings. Service-role only.
create table if not exists public.secmon_heartbeats (
  source text primary key check (source ~ '^[a-z0-9][a-z0-9_.:-]{1,63}$'),
  last_seen timestamptz not null default now(),
  last_ok boolean not null default true,
  detail text check (char_length(detail) <= 300),
  max_age_hours int not null default 48 check (max_age_hours between 1 and 720),
  deadman_alerted_at timestamptz
);
alter table public.secmon_heartbeats enable row level security;
revoke all on public.secmon_heartbeats from public, anon, authenticated;

create table if not exists public.secmon_findings (
  fingerprint text primary key check (char_length(fingerprint) <= 200),
  kind text not null check (char_length(kind) <= 40),
  severity text not null check (severity in ('low','moderate','high','critical')),
  title text not null check (char_length(title) <= 300),
  detail text check (char_length(detail) <= 1000),
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  alerted_at timestamptz,
  resolved_at timestamptz
);
create index if not exists secmon_findings_open_idx on public.secmon_findings (last_seen desc) where resolved_at is null;
alter table public.secmon_findings enable row level security;
revoke all on public.secmon_findings from public, anon, authenticated;

-- RLS / grant sanity: tables in exposed schemas without RLS, and anon/authenticated grants on tables without RLS.
create or replace function public.secmon_rls_audit()
returns table (schema_name text, table_name text, issue text)
language sql stable security definer set search_path = '' as $$
  select n.nspname::text, c.relname::text, 'rls_disabled'
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where c.relkind in ('r','p') and n.nspname = 'public' and not c.relrowsecurity
  union all
  select n.nspname::text, c.relname::text, 'anon_write_grant'
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where c.relkind in ('r','p') and n.nspname = 'public'
    and (has_table_privilege('anon', c.oid, 'insert') or has_table_privilege('anon', c.oid, 'update') or has_table_privilege('anon', c.oid, 'delete'))
    and not c.relrowsecurity
  union all
  select n.nspname::text, p.proname::text, 'definer_fn_executable_by_anon'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute')
    and p.proname like 'ops\_%'
$$;
revoke all on function public.secmon_rls_audit() from public, anon, authenticated;
grant execute on function public.secmon_rls_audit() to service_role;
