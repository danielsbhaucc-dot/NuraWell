-- pii_access_grants.ticket_ref / country may be legacy plaintext or enc:v2.
-- App writer (createPiiGrant). No SQL filters on these columns. No GRANT/RLS change.
-- Does not touch reason (already 000235). field_enc_enforcement stays off.

alter table public.pii_access_grants drop constraint if exists pii_access_grants_ticket_ref_check;
alter table public.pii_access_grants add constraint pii_access_grants_ticket_ref_check check (
  ticket_ref is null
  or (ticket_ref like 'enc:v2:%' and char_length(ticket_ref) <= 4000)
  or (ticket_ref not like 'enc:v2:%' and ticket_ref ~ '^[A-Za-z0-9#._-]{2,40}$')
);

alter table public.pii_access_grants drop constraint if exists pii_access_grants_country_check;
alter table public.pii_access_grants add constraint pii_access_grants_country_check check (
  country is null
  or (country like 'enc:v2:%' and char_length(country) <= 4000)
  or (country not like 'enc:v2:%' and char_length(country) <= 2)
);
