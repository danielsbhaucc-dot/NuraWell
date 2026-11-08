-- ops_device_enrollments.label/location may be legacy plaintext (<= 80) or enc:v2.
-- App writer (enrollment.openEnrollment). Lookups stay on id/token_hash. No GRANT/RLS change.
-- Enforcement stays off; hosted backfill cron does not rewrite (LOCAL_BACKFILL_ONLY).

alter table public.ops_device_enrollments drop constraint if exists ops_device_enrollments_label_check;
alter table public.ops_device_enrollments add constraint ops_device_enrollments_label_check check (
  label is null
  or (label like 'enc:v2:%' and char_length(label) <= 4000)
  or (label not like 'enc:v2:%' and char_length(label) <= 80)
);

alter table public.ops_device_enrollments drop constraint if exists ops_device_enrollments_location_check;
alter table public.ops_device_enrollments add constraint ops_device_enrollments_location_check check (
  location is null
  or (location like 'enc:v2:%' and char_length(location) <= 4000)
  or (location not like 'enc:v2:%' and char_length(location) <= 80)
);
