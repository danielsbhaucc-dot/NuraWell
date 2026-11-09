-- pii_access_log.country / resource may be legacy plaintext or enc:v2.
-- Append-only (trg_pii_access_log_immutable): seal on INSERT only; no UPDATE backfill.
-- App writer: pii-access.ts log(). No GRANT/RLS change. Enforcement stays off.

alter table public.pii_access_log drop constraint if exists pii_access_log_country_check;
alter table public.pii_access_log add constraint pii_access_log_country_check check (
  country is null
  or (country like 'enc:v2:%' and char_length(country) <= 4000)
  or (country not like 'enc:v2:%' and char_length(country) <= 2)
);

alter table public.pii_access_log drop constraint if exists pii_access_log_resource_check;
alter table public.pii_access_log add constraint pii_access_log_resource_check check (
  resource is null
  or (resource like 'enc:v2:%' and char_length(resource) <= 4000)
  or (resource not like 'enc:v2:%' and char_length(resource) <= 80)
);
