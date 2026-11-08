-- access_audit_runs.error may be legacy plaintext (<= 120) or enc:v2.
-- App-only writer (audit-job). No GRANT, no RLS change, enforcement stays off.
-- Does not touch findings.summary or grants.reason.

alter table public.access_audit_runs drop constraint if exists access_audit_runs_error_check;
alter table public.access_audit_runs add constraint access_audit_runs_error_check check (
  error is null
  or (error like 'enc:v2:%' and char_length(error) <= 4000)
  or (error not like 'enc:v2:%' and char_length(error) <= 120)
);
