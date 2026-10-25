-- Logical DB backup without pg_dump (runs in the app's nightly cron, no CI minutes).
-- Lists base tables to back up and returns one table as JSON; verify parses rows back into the table's row type
-- (restore check without writing anything). Service-role only.
create or replace function public.ops_backup_tables()
returns table (schema_name text, table_name text, approx_rows bigint)
language sql stable security definer set search_path = '' as $$
  select n.nspname::text, c.relname::text, greatest(c.reltuples, 0)::bigint
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where c.relkind in ('r','p') and not c.relispartition
    and n.nspname in ('public','auth','storage','supabase_migrations')
  order by 1, 2
$$;

create or replace function public.ops_backup_table(p_schema text, p_table text, p_offset int default 0, p_limit int default 5000)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r jsonb;
begin
  if p_schema not in ('public','auth','storage','supabase_migrations') then raise exception 'schema not allowed'; end if;
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = p_schema and c.relname = p_table and c.relkind in ('r','p')) then
    raise exception 'unknown table';
  end if;
  execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from (select * from %I.%I t order by t::text limit %s offset %s) t',
    p_schema, p_table, least(greatest(p_limit, 1), 20000), greatest(p_offset, 0)) into r;
  return r;
end $$;

-- Restore check: the JSON rows must load back into the exact table row type (no writes).
create or replace function public.ops_backup_verify(p_schema text, p_table text, p_rows jsonb)
returns int
language plpgsql stable security definer set search_path = '' as $$
declare n int;
begin
  if p_schema not in ('public','auth','storage','supabase_migrations') then raise exception 'schema not allowed'; end if;
  execute format('select count(*) from jsonb_populate_recordset(null::%I.%I, $1)', p_schema, p_table) into n using p_rows;
  return n;
end $$;

revoke all on function public.ops_backup_tables() from public, anon, authenticated;
revoke all on function public.ops_backup_table(text, text, int, int) from public, anon, authenticated;
revoke all on function public.ops_backup_verify(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.ops_backup_tables() to service_role;
grant execute on function public.ops_backup_table(text, text, int, int) to service_role;
grant execute on function public.ops_backup_verify(text, text, jsonb) to service_role;
