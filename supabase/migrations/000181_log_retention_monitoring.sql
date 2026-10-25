-- Log retention, space monitoring and suspicious-pattern signals.
-- Purges ONLY operational logs and access logs past their documented retention (see docs/security/RETENTION_DELETION.he.md).
-- Legal / consent evidence is REPORT-ONLY here: counted, never deleted by this job.
-- Idempotent: safe to re-run; batched deletes (ctid batches) so tables are never locked for long.

create table if not exists public.log_retention_runs (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  dry_run boolean not null,
  duration_ms integer,
  result jsonb not null
);
create index if not exists log_retention_runs_created_idx on public.log_retention_runs (created_at);

-- Lean security signal rows: no bodies, no raw IP (salted hash only), path without query string.
create table if not exists public.security_signals (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  kind text not null check (char_length(kind) <= 40),
  ip_hash text check (char_length(ip_hash) <= 64),
  actor_id uuid,
  path text check (char_length(path) <= 200),
  country text check (char_length(country) <= 4),
  n integer not null default 1
);
create index if not exists security_signals_created_idx on public.security_signals (created_at);
create index if not exists security_signals_ip_idx on public.security_signals (ip_hash, kind, created_at desc);

-- Temporary blocks only (max 1 hour enforced by check). Never permanent.
create table if not exists public.ip_blocks (
  ip_hash text primary key check (char_length(ip_hash) <= 64),
  created_at timestamptz not null default now(),
  blocked_until timestamptz not null,
  reason text not null check (char_length(reason) <= 80),
  constraint ip_blocks_max_1h check (blocked_until <= created_at + interval '61 minutes')
);
create index if not exists ip_blocks_until_idx on public.ip_blocks (blocked_until);

alter table public.log_retention_runs enable row level security;
alter table public.security_signals enable row level security;
alter table public.ip_blocks enable row level security;
revoke all on public.log_retention_runs, public.security_signals, public.ip_blocks from anon, authenticated;

-- Indexes supporting the purge predicates (only where missing).
create index if not exists ops_security_events_created_idx on public.ops_security_events (created_at);
create index if not exists legal_access_log_created_idx on public.legal_access_log (created_at);
create index if not exists secure_vault_access_log_created_idx on public.secure_vault_access_log (created_at);
create index if not exists stepup_requests_created_idx on public.stepup_requests (created_at);
create index if not exists gideon_device_requests_created_idx on public.gideon_device_requests (created_at);
create index if not exists ops_login_requests_created_idx on public.ops_login_requests (created_at);
create index if not exists notification_logs_created_asc_idx on public.notification_logs (created_at);

-- Single source of truth for the policy inside the DB (mirrored in apps/web/lib/logs/policy.ts; a test keeps them equal).
create or replace function public.log_retention_policy()
returns table (tbl text, ts_col text, days int, klass text, extra text)
language sql immutable set search_path = public as $$
  values
    ('error_events','created_at',30,'operational',null),
    ('chat_perf_timings','created_at',90,'operational',null),
    ('gideon_outbox','created_at',30,'operational','status <> ''pending'''),
    ('delivery_log','created_at',90,'operational',null),
    ('notification_logs','created_at',90,'operational',null),
    ('notify_quality_events','created_at',90,'operational',null),
    ('ops_login_requests','created_at',30,'operational',null),
    ('stepup_requests','created_at',30,'operational',null),
    ('gideon_device_requests','created_at',30,'operational','status <> ''pending'''),
    ('rate_limit_buckets','expires_at',1,'operational',null),
    ('security_signals','created_at',90,'operational',null),
    ('ip_blocks','blocked_until',7,'operational',null),
    ('log_retention_runs','created_at',400,'operational',null),
    ('admin_audit_log','created_at',730,'access',null),
    ('ops_security_events','created_at',730,'access',null),
    ('ceo_audit_log','created_at',730,'access',null),
    ('challenge_admin_audit_log','created_at',730,'access',null),
    ('chat_transcript_admin_audit_log','created_at',730,'access',null),
    ('secure_vault_access_log','created_at',730,'access',null),
    ('legal_access_log','created_at',2555,'legal',null),
    ('consent_history','created_at',2555,'legal',null),
    ('consent_evidence','created_at',2555,'legal',null),
    ('consent_evidence_attestations','created_at',2555,'legal',null),
    ('billing_events','created_at',2555,'legal',null),
    ('chat_transcript_access_requests','created_at',2555,'legal',null)
$$;

create or replace function public.run_log_retention(p_dry_run boolean default true, p_batch int default 2000)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
set statement_timeout = '50s'
as $$
declare
  p record; n bigint; total bigint; eligible bigint; i int;
  t0 timestamptz := clock_timestamp();
  cond text; out jsonb := '{}'::jsonb;
  b int := greatest(100, least(coalesce(p_batch, 2000), 10000));
begin
  -- one run at a time (idempotent under overlapping triggers)
  if not pg_try_advisory_xact_lock(hashtext('run_log_retention')) then
    return jsonb_build_object('skipped', 'already_running');
  end if;
  for p in select * from public.log_retention_policy() loop
    if to_regclass('public.' || p.tbl) is null then continue; end if;
    cond := format('%I < now() - make_interval(days => %s)', p.ts_col, p.days) || coalesce(' and ' || p.extra, '');
    execute format('select count(*) from %I where %s', p.tbl, cond) into eligible;
    total := 0;
    if not p_dry_run and p.klass in ('operational', 'access') and eligible > 0 then
      for i in 1..500 loop
        execute format('delete from %I where ctid = any (array(select ctid from %I where %s limit %s))', p.tbl, p.tbl, cond, b);
        get diagnostics n = row_count;
        total := total + n;
        exit when n < b;
      end loop;
    end if;
    out := out || jsonb_build_object(p.tbl, jsonb_build_object('class', p.klass, 'days', p.days, 'eligible', eligible, 'deleted', total));
  end loop;
  insert into public.log_retention_runs (dry_run, duration_ms, result)
  values (p_dry_run, (extract(epoch from clock_timestamp() - t0) * 1000)::int, out);
  return jsonb_build_object('dry_run', p_dry_run, 'tables', out);
end $$;

create or replace function public.log_storage_stats()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'db_bytes', pg_database_size(current_database()),
    'tables', coalesce((
      select jsonb_object_agg(p.tbl, jsonb_build_object(
        'bytes', pg_total_relation_size(('public.' || p.tbl)::regclass),
        'rows', coalesce(s.n_live_tup, 0),
        'dead', coalesce(s.n_dead_tup, 0),
        'last_autovacuum', s.last_autovacuum))
      from public.log_retention_policy() p
      left join pg_stat_user_tables s on s.schemaname = 'public' and s.relname = p.tbl
      where to_regclass('public.' || p.tbl) is not null), '{}'::jsonb),
    'top_tables', (
      select jsonb_agg(jsonb_build_object('name', relname, 'bytes', b) order by b desc) from (
        select relname, pg_total_relation_size(relid) b from pg_stat_user_tables where schemaname = 'public' order by 2 desc limit 8) x)
  )
$$;

revoke all on function public.run_log_retention(boolean, int) from public, anon, authenticated;
revoke all on function public.log_storage_stats() from public, anon, authenticated;
revoke all on function public.log_retention_policy() from public, anon, authenticated;
grant execute on function public.run_log_retention(boolean, int) to service_role;
grant execute on function public.log_storage_stats() to service_role;
grant execute on function public.log_retention_policy() to service_role;
