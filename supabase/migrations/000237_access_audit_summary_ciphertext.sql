-- access_audit_findings.summary may be legacy plaintext (<= 400) or enc:v2.
-- Does not grant privileges, does not disable RLS, does not change signals or the created_at index.
-- The reject trigger stays inactive until field_enc_enforcement is turned on. This file does not turn it on.

alter table public.access_audit_findings drop constraint if exists access_audit_findings_summary_check;
alter table public.access_audit_findings add constraint access_audit_findings_summary_check check (
  (summary like 'enc:v2:%' and char_length(summary) <= 4000)
  or (summary not like 'enc:v2:%' and char_length(summary) <= 400)
);
