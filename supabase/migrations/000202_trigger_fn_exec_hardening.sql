-- Nightly security upkeep 2026-10-26 (Supabase advisors: anon/authenticated SECURITY DEFINER exec, function_search_path_mutable).
-- 1) Trigger functions are never meant to be called through PostgREST /rpc. Remove EXECUTE from the API roles.
--    Postgres only checks EXECUTE when a trigger is CREATED, not when it fires, so existing triggers keep working
--    (verified on a scratch Postgres 17 cluster). Idempotent and safe to re-run; touches no rows.
-- 2) Pin search_path on the trigger functions the advisor flagged as mutable (they may not exist on a fresh branch).
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prorettype = 'trigger'::regtype
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;

  if to_regprocedure('public.iam_audit_immutable()') is not null then
    alter function public.iam_audit_immutable() set search_path = public, pg_temp;
  end if;
  if to_regprocedure('public.iam_catalog_readonly()') is not null then
    alter function public.iam_catalog_readonly() set search_path = public, pg_temp;
  end if;
  if to_regprocedure('public.trg_billing_webhook_append_only()') is not null then
    alter function public.trg_billing_webhook_append_only() set search_path = public, pg_temp;
  end if;
end $$;
