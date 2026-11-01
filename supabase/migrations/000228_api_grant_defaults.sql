-- 000228: close API grants that default privileges left behind.
--
-- compliance_tasks (000180) revoked PUBLIC and anon only. Default privileges for
-- role postgres in schema public had already granted ALL to authenticated,
-- including INSERT, DELETE and TRUNCATE. Row level security does not apply to
-- TRUNCATE. Policies stay as written: SELECT and UPDATE for admins only.
-- The app writes this table with service_role.
--
-- Identity sequences inherited USAGE and UPDATE (setval) for anon and
-- authenticated even when those roles cannot insert into the parent table.
-- nextval and setval are not row checks. A role that can insert keeps USAGE
-- (needed for the identity default) and loses UPDATE.
--
-- Default privileges for role postgres are tightened so the next table or
-- sequence created by a migration does not receive those grants again.
-- service_role is left as it is.

revoke all on table public.compliance_tasks from public, anon, authenticated;
grant select, update on table public.compliance_tasks to authenticated;

do $$
declare r record;
begin
  for r in
    select seq.relname as seq_name, tbl.oid as tbl_oid
    from pg_class seq
    join pg_namespace n on n.oid = seq.relnamespace
    join pg_depend d on d.objid = seq.oid
      and d.classid = 'pg_class'::regclass
      and d.refclassid = 'pg_class'::regclass
      and d.deptype in ('a', 'i')
    join pg_class tbl on tbl.oid = d.refobjid
    where n.nspname = 'public' and seq.relkind = 'S'
  loop
    execute format('revoke all on sequence public.%I from public, anon', r.seq_name);
    if has_table_privilege('authenticated', r.tbl_oid, 'INSERT') then
      execute format('revoke update on sequence public.%I from authenticated', r.seq_name);
    else
      execute format('revoke all on sequence public.%I from authenticated', r.seq_name);
    end if;
  end loop;
end $$;

alter default privileges for role postgres in schema public
  revoke all on sequences from public, anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on tables from authenticated;
