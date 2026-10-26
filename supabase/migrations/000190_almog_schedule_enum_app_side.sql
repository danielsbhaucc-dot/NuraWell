-- Round-4 security: almog_assignments.schedule becomes per-user encrypted (enc:v2), so the DB can no longer
-- check its value. Allowed values are enforced in the app before any write
-- (apps/web/lib/security/column-enums.ts, applied centrally in lib/security/field-fetch.ts).
alter table public.almog_assignments drop constraint if exists almog_assignments_schedule_check;
comment on column public.almog_assignments.schedule is 'enum validated app-side (column-enums.ts) before encryption';
