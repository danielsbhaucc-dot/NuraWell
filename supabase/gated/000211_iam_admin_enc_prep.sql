-- GATED — DO NOT APPLY until #357, #358, #359 and #362 are merged (they create these tables in
-- migrations 000191-000201). Then: move this file to supabase/migrations/ (keep or re-claim the number),
-- move GATED_AFTER_IAM_MERGE entries in apps/web/lib/security/field-registry.ts into ENCRYPTED_TABLES +
-- FIELD_V2_TABLES, and regenerate the enc-reject triggers into a NEW migration
-- (node --experimental-strip-types apps/web/scripts/gen-enc-triggers.mts supabase/migrations/000NNN_enc_reject_triggers_sync.sql).
-- It sits outside supabase/migrations/ on purpose so no runner can pick it up early.
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
