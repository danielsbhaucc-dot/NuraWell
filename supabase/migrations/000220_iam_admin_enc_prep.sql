-- IAM/admin enc prep (was supabase/gated/000211). Requires #357, #358, #359, #362 (000191-000201) merged and applied first.
-- Registry entries moved from GATED_AFTER_IAM_MERGE into ENCRYPTED_TABLES + FIELD_V2_TABLES; triggers regenerated in 000221.
--
-- Drops plaintext-only CHECK constraints on app-written columns (ciphertext is longer / not matching a regex);
-- the app (lib/platform/access/pii-access.ts, lib/ops/enrollment.ts, lib/platform/access/audit-job.ts) already
-- validates and slices these values before the insert.

do $$
declare r record;
begin
  for r in
    select conrelid::regclass::text as tbl, conname
    from pg_constraint
    where contype = 'c'
      and conrelid in ('public.pii_access_grants'::regclass, 'public.access_audit_findings'::regclass)
      and (pg_get_constraintdef(oid) ~ 'reason' or pg_get_constraintdef(oid) ~ 'ticket_ref' or pg_get_constraintdef(oid) ~ 'summary')
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;

-- access_audit_findings.signals is text[] of short signal codes + free text; store as one enc:v2 json value.
alter table public.access_audit_findings alter column signals drop default;
alter table public.access_audit_findings alter column signals type jsonb using to_jsonb(signals);
alter table public.access_audit_findings alter column signals set default '[]'::jsonb;
