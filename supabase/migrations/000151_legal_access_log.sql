-- Append-only access log for Ops "משפטי". Deliberately NOT referenced by any retention/cleanup job
-- (run_data_retention only touches admin_audit_log). UPDATE/DELETE/TRUNCATE are rejected by trigger.
create table if not exists public.legal_access_log (
  id bigserial primary key,
  actor_id uuid,
  action text not null,
  user_id uuid,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists legal_access_log_user_idx on public.legal_access_log (user_id, created_at desc);

alter table public.legal_access_log enable row level security;
revoke all on public.legal_access_log from public, anon, authenticated;
drop trigger if exists legal_access_log_no_mutate on public.legal_access_log;
create trigger legal_access_log_no_mutate before update or delete on public.legal_access_log
  for each row execute function public.trg_consent_evidence_append_only();
drop trigger if exists legal_access_log_no_truncate on public.legal_access_log;
create trigger legal_access_log_no_truncate before truncate on public.legal_access_log
  for each statement execute function public.trg_consent_evidence_append_only();
grant select, insert on public.legal_access_log to service_role;
grant usage on sequence public.legal_access_log_id_seq to service_role;

-- Backfill existing legal access rows (kept in admin_audit_log too; that copy may age out).
insert into public.legal_access_log (actor_id, action, user_id, detail, created_at)
select a.actor_id, a.path,
       case when (a.detail->>'user_id') ~ '^[0-9a-f-]{36}$' then (a.detail->>'user_id')::uuid end,
       coalesce(a.detail, '{}'::jsonb), a.created_at
from public.admin_audit_log a
where a.method = 'LEGAL'
  and not exists (select 1 from public.legal_access_log l where l.created_at = a.created_at and l.action = a.path);
