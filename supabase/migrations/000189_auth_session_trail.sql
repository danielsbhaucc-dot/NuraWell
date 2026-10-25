-- Auth audit gap: auth.audit_log_entries is empty on this project and auth.sessions rows vanish on
-- logout/revoke/expiry, so the investigation timeline could lose how an intruder got in.
-- Record every new auth session server-side (cannot be bypassed by calling the auth API directly).
-- Stores session id, user, AAL, IP and user agent (same fields auth.sessions already holds), service-role only.
create table if not exists public.auth_session_trail (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  session_id uuid not null,
  user_id uuid not null,
  aal text,
  ip text,
  user_agent text
);
create index if not exists auth_session_trail_user_idx on public.auth_session_trail (user_id, created_at desc);
create index if not exists auth_session_trail_ip_idx on public.auth_session_trail (ip, created_at desc);
alter table public.auth_session_trail enable row level security;
revoke all on public.auth_session_trail from public, anon, authenticated;

create or replace function public.trg_auth_session_trail() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  begin
    insert into public.auth_session_trail (session_id, user_id, aal, ip, user_agent)
    values (new.id, new.user_id, new.aal::text, host(new.ip), left(new.user_agent, 300));
  exception when others then null; -- never break sign-in
  end;
  return new;
end $$;
revoke all on function public.trg_auth_session_trail() from public, anon, authenticated;

drop trigger if exists nw_auth_session_trail on auth.sessions;
create trigger nw_auth_session_trail after insert on auth.sessions
  for each row execute function public.trg_auth_session_trail();

-- Access log class: keep 730 days like other access logs.
create or replace function public.ops_session_trail(p_user uuid, p_ip text, p_start timestamptz, p_end timestamptz)
returns table (ts timestamptz, session_id uuid, user_id uuid, aal text, ip text, user_agent text)
language sql stable security definer set search_path = '' as $$
  select t.created_at, t.session_id, t.user_id, t.aal, t.ip, t.user_agent from public.auth_session_trail t
  where t.created_at between p_start and p_end
    and ((p_user is not null and t.user_id = p_user) or (p_ip is not null and t.ip = p_ip))
  order by t.created_at limit 400
$$;
revoke all on function public.ops_session_trail(uuid, text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.ops_session_trail(uuid, text, timestamptz, timestamptz) to service_role;

-- Retention: session trail is an access log (730d). Same list as 000185 plus auth_session_trail.
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
    ('auth_session_trail','created_at',730,'access',null),
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
