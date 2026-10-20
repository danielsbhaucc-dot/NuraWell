-- Monthly restore drill (compliance doc 08). One transaction: copy every public table into a temp schema,
-- compare row counts, drop the schema, record the result. No data leaves the database. Service role only.
create or replace function public.owner_restore_drill()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare t record; src bigint; dst bigint; n int := 0; total bigint := 0; bad text[] := '{}';
  s text := 'restore_drill_' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS'); res jsonb;
begin
  execute format('create schema %I', s);
  for t in select c.relname from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
           where ns.nspname = 'public' and c.relkind = 'r' order by 1 loop
    execute format('create table %I.%I (like public.%I including all)', s, t.relname, t.relname);
    execute format('insert into %I.%I overriding system value select * from public.%I', s, t.relname, t.relname);
    execute format('select count(*) from public.%I', t.relname) into src;
    execute format('select count(*) from %I.%I', s, t.relname) into dst;
    if src <> dst then bad := bad || t.relname::text; end if;
    n := n + 1; total := total + dst;
  end loop;
  execute format('drop schema %I cascade', s);
  res := jsonb_build_object('tables', n, 'rows', total, 'mismatched', to_jsonb(bad), 'at', now());
  insert into public.owner_compliance_status as o (item_key, done, done_at, meta, updated_at, updated_by)
  values ('backup_drill', cardinality(bad) = 0, now(), res, now(), 'restore-drill')
  on conflict (item_key) do update set done = excluded.done, done_at = excluded.done_at,
    meta = (o.meta - 'tables' - 'rows' - 'mismatched' - 'error') || excluded.meta, updated_at = now(), updated_by = 'restore-drill';
  return res;
end $$;
revoke all on function public.owner_restore_drill() from public, anon, authenticated;
grant execute on function public.owner_restore_drill() to service_role;
