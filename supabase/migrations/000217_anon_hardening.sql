-- 000217: close anonymous access (security round 4, 2026-10-26)
-- 1) ops_break_glass_reset is an owner-only SQL Editor tool (runbook); it must never be callable through the API.
do $$ declare f regprocedure; begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'ops_break_glass_reset' loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;

-- 2) anon keeps SELECT only on public catalog tables; no write privilege anywhere.
do $$ declare t text; keep text[] := array['site_settings','journey_stations','journey_steps','courses','lessons','achievements','media_files']; begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind in ('r','p','v','m') loop
    if t = any(keep) then
      execute format('revoke insert, update, delete, truncate, references, trigger on public.%I from anon', t);
    else
      execute format('revoke all on public.%I from anon', t);
    end if;
  end loop;
end $$;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on tables from anon;
