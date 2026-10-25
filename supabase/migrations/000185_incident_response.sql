-- Incident response: manual IP/range blocks, admin lockdown, incidents, Telegram action nonces,
-- and service-role-only views over auth.sessions / auth.audit_log_entries for the investigation view.
-- No raw secrets stored. Never touches real user data; all functions are service_role only.

-- 1) ip_blocks: auto blocks stay ≤ 1h; manual blocks may be longer or permanent (blocked_until = 'infinity').
alter table public.ip_blocks add column if not exists manual boolean not null default false;
alter table public.ip_blocks add column if not exists created_by uuid;
alter table public.ip_blocks add column if not exists note text check (char_length(note) <= 200);
alter table public.ip_blocks drop constraint if exists ip_blocks_max_1h;
alter table public.ip_blocks add constraint ip_blocks_max_1h check (manual or blocked_until <= created_at + interval '61 minutes');

-- Range blocks (CIDR). Raw range is an attacker network, needed to match; kept until lifted/expired.
create table if not exists public.ip_block_ranges (
  id bigint generated always as identity primary key,
  cidr cidr not null unique,
  created_at timestamptz not null default now(),
  created_by uuid,
  blocked_until timestamptz not null,
  reason text not null check (char_length(reason) <= 80),
  constraint ip_block_ranges_not_huge check (masklen(cidr) >= case when family(cidr) = 4 then 16 else 32 end)
);

-- 2) Admin lockdown (single row). allow_ip_hash null = step-up-everywhere only.
create table if not exists public.ops_lockdown (
  id smallint primary key default 1 check (id = 1),
  active boolean not null default false,
  started_at timestamptz,
  started_by uuid,
  keep_session uuid,
  allow_ip_hash text check (char_length(allow_ip_hash) <= 64),
  allowlist_until timestamptz,
  ended_at timestamptz,
  ended_via text check (char_length(ended_via) <= 40)
);
insert into public.ops_lockdown (id) values (1) on conflict do nothing;

-- 3) Incidents (opened by "זה לא אני" or manually).
create table if not exists public.security_incidents (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  opened_via text not null check (char_length(opened_via) <= 40),
  subject_user uuid,
  session_id uuid,
  ip_hash text check (char_length(ip_hash) <= 64),
  status text not null default 'open' check (status in ('open','closed')),
  actions jsonb not null default '[]'::jsonb,
  closed_at timestamptz
);
create index if not exists security_incidents_created_idx on public.security_incidents (created_at desc);

-- 4) Telegram one-tap defensive actions: single-use nonce (hash only), short TTL.
create table if not exists public.tg_action_nonces (
  id text primary key check (char_length(id) <= 32),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  nonce_hash text not null check (char_length(nonce_hash) <= 64),
  subject_user uuid,
  session_id uuid,
  ip_hash text check (char_length(ip_hash) <= 64),
  country text check (char_length(country) <= 4)
);
create index if not exists tg_action_nonces_exp_idx on public.tg_action_nonces (expires_at);

-- Known places Daniel confirmed ("זה אני").
create table if not exists public.ops_known_places (
  ip_hash text primary key check (char_length(ip_hash) <= 64),
  created_at timestamptz not null default now(),
  via text not null check (char_length(via) <= 40)
);

alter table public.ip_block_ranges enable row level security;
alter table public.ops_lockdown enable row level security;
alter table public.security_incidents enable row level security;
alter table public.tg_action_nonces enable row level security;
alter table public.ops_known_places enable row level security;
revoke all on public.ip_block_ranges, public.ops_lockdown, public.security_incidents, public.tg_action_nonces, public.ops_known_places from anon, authenticated;

-- 5) Auth views (service role only).
create or replace function public.ops_list_sessions(p_user uuid default null, p_ip text default null, p_limit int default 50)
returns table (id uuid, user_id uuid, created_at timestamptz, updated_at timestamptz, refreshed_at timestamp, ip text, user_agent text, aal text, not_after timestamptz, methods text[])
language sql stable security definer set search_path = '' as $$
  select s.id, s.user_id, s.created_at, s.updated_at, s.refreshed_at, host(s.ip), left(s.user_agent, 300), s.aal::text, s.not_after,
    coalesce((select array_agg(distinct c.authentication_method) from auth.mfa_amr_claims c where c.session_id = s.id), '{}')
  from auth.sessions s
  where (p_user is null or s.user_id = p_user) and (p_ip is null or host(s.ip) = p_ip)
  order by s.created_at desc limit least(greatest(coalesce(p_limit, 50), 1), 200)
$$;

create or replace function public.ops_revoke_session(p_session uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare n int; begin
  delete from auth.sessions where id = p_session;
  get diagnostics n = row_count; return n;
end $$;

create or replace function public.ops_revoke_other_sessions(p_user uuid, p_keep uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare n int; begin
  delete from auth.sessions where user_id = p_user and (p_keep is null or id <> p_keep);
  get diagnostics n = row_count; return n;
end $$;

-- Auth events (logins, failures, refresh-token reuse) by user and/or IP in a window.
create or replace function public.ops_auth_events(p_user uuid, p_ip text, p_start timestamptz, p_end timestamptz)
returns table (ts timestamptz, action text, ip text, actor_id text, provider text, detail jsonb)
language sql stable security definer set search_path = '' as $$
  select a.created_at, coalesce(a.payload->>'action',''), a.ip_address, a.payload->>'actor_id',
    coalesce(a.payload->'traits'->>'provider', a.payload->>'provider'),
    (a.payload::jsonb - 'traits' - 'actor_username') 
  from auth.audit_log_entries a
  where a.created_at between p_start and p_end
    and ((p_user is not null and (a.payload->>'actor_id' = p_user::text or a.payload->'traits'->>'user_id' = p_user::text))
      or (p_ip is not null and a.ip_address = p_ip))
  order by a.created_at limit 400
$$;

revoke all on function public.ops_list_sessions(uuid, text, int), public.ops_revoke_session(uuid), public.ops_revoke_other_sessions(uuid, uuid), public.ops_auth_events(uuid, text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.ops_list_sessions(uuid, text, int), public.ops_revoke_session(uuid), public.ops_revoke_other_sessions(uuid, uuid), public.ops_auth_events(uuid, text, timestamptz, timestamptz) to service_role;


-- Range check for the admin guard (inet ops are not expressible through PostgREST filters).
create or replace function public.ops_ip_in_blocked_range(p_ip text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.ip_block_ranges r where r.blocked_until > now() and r.cidr >>= p_ip::inet)
$$;
revoke all on function public.ops_ip_in_blocked_range(text) from public, anon, authenticated;
grant execute on function public.ops_ip_in_blocked_range(text) to service_role;

-- Retention: nonces 7d, incidents are access logs (730d), range blocks purged 7d after expiry.
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
    ('ip_block_ranges','blocked_until',7,'operational',null),
    ('tg_action_nonces','expires_at',7,'operational',null),
    ('log_retention_runs','created_at',400,'operational',null),
    ('admin_audit_log','created_at',730,'access',null),
    ('ops_security_events','created_at',730,'access',null),
    ('security_incidents','created_at',730,'access',null),
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
revoke all on function public.log_retention_policy() from public, anon, authenticated;
grant execute on function public.log_retention_policy() to service_role;
