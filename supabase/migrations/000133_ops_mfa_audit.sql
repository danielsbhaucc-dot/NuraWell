-- Ops 2nd factor (passkey), admin audit log, step-up purposes, grant hygiene.
alter table public.webauthn_challenges drop constraint if exists webauthn_challenges_purpose_check;
alter table public.webauthn_challenges add constraint webauthn_challenges_purpose_check
  check (purpose in ('register', 'approve', 'unlock', 'verify', 'ops_login', 'settings', 'remove_key'));
alter table public.webauthn_challenges add column if not exists payload jsonb;

create table if not exists public.admin_audit_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  actor_id uuid,
  method text not null,
  path text not null,
  ip text,
  detail jsonb not null default '{}'
);
create index if not exists admin_audit_log_created_idx on public.admin_audit_log (created_at desc);
alter table public.admin_audit_log enable row level security;
revoke all on public.admin_audit_log from anon, authenticated;

-- For the proxy (user JWT): does the calling admin have a passkey? (no key material exposed)
create or replace function public.admin_has_passkey()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
     and exists (select 1 from public.admin_passkeys k where k.user_id = auth.uid());
$$;
revoke all on function public.admin_has_passkey() from public, anon;
grant execute on function public.admin_has_passkey() to authenticated;

-- Token tables are service-role only (RLS already blocks; drop the grants too).
revoke all on public.demo_access_links, public.demo_access_sessions from anon, authenticated;
