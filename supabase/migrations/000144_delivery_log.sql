-- Outbound delivery log (email / telegram / push). No content, codes or tokens; recipient stored only as a keyed hash + mask.
create table if not exists public.delivery_log (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  channel text not null check (channel in ('email','telegram','push','sms','other')),
  purpose text not null default 'general',
  recipient_hash text,
  recipient_mask text,
  ok boolean not null,
  provider_id text,
  error text
);
create index if not exists delivery_log_created_idx on public.delivery_log (created_at desc);
create index if not exists delivery_log_fail_idx on public.delivery_log (created_at desc) where not ok;
alter table public.delivery_log enable row level security;
revoke all on public.delivery_log from anon, authenticated;
comment on table public.delivery_log is 'Outbound send results; service-role only; retention 90 days (master cron).';

-- Triage state per error fingerprint (status + link to Or forward). No PII.
create table if not exists public.error_issue_state (
  fingerprint text primary key,
  status text not null default 'new' check (status in ('new','in_progress','resolved')),
  forward_id uuid,
  updated_at timestamptz not null default now()
);
alter table public.error_issue_state enable row level security;
revoke all on public.error_issue_state from anon, authenticated;

create index if not exists admin_audit_log_security_idx on public.admin_audit_log (created_at desc) where method = 'SECURITY';
create index if not exists error_events_created_idx on public.error_events (created_at desc);

-- Verification helper for Gideon "sign out everywhere": count remaining sessions (no token data exposed).
create or replace function public.ops_count_user_sessions(p_user uuid)
returns int language sql security definer set search_path = '' as $$
  select count(*)::int from auth.sessions where user_id = p_user;
$$;
revoke all on function public.ops_count_user_sessions(uuid) from public, anon, authenticated;
grant execute on function public.ops_count_user_sessions(uuid) to service_role;
