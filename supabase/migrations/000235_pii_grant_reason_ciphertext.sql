-- pii_access_grants.reason may be legacy plaintext (15-500, still enforced) or enc:v2.
-- Does not grant privileges, does not disable RLS, does not touch country or ticket_ref.
-- The app validates the plaintext length before sealing. The reject trigger stays inactive
-- until field_enc_enforcement is turned on for this table; this migration does not turn it on.

alter table public.pii_access_grants drop constraint if exists pii_access_grants_reason_check;
alter table public.pii_access_grants add constraint pii_access_grants_reason_check check (
  (reason like 'enc:v2:%' and char_length(reason) <= 4000)
  or (reason not like 'enc:v2:%' and char_length(reason) between 15 and 500)
);
