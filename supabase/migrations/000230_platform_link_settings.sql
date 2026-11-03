-- 000230 (Phase 2b): parent-platform license enforcement kill switch.
-- Enforcement is ARMED only by the deploy env PLATFORM_LICENSE_MODE=enforce. This row can only DOWNGRADE it:
--   mode='shadow'  -> nobody is ever blocked (instant rollback, no deploy; app caches it <=30 s)
--   scope='test'   -> only identities flagged app_metadata.pl_enforce_test=true can be blocked
--   scope='all'    -> every non-admin user needs an active parent license (only after owner approval)
-- If this row is unreadable the app fails OPEN (shadow). Service role only: RLS on, no policies.
create table if not exists public.platform_link_settings (
  id smallint primary key default 1 check (id = 1),
  mode text not null default 'shadow' check (mode in ('shadow', 'enforce')),
  scope text not null default 'test' check (scope in ('test', 'all')),
  note text check (note is null or char_length(note) <= 200),
  updated_at timestamptz not null default now()
);
alter table public.platform_link_settings enable row level security;
revoke all on public.platform_link_settings from anon, authenticated;
grant select, insert, update, delete on public.platform_link_settings to service_role;
insert into public.platform_link_settings (id, mode, scope, note)
values (1, 'shadow', 'test', 'Phase 2b initial state') on conflict (id) do nothing;
