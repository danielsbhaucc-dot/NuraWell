-- DB slimming, stage 2: compliance document bytes move to the private EU legal bucket.
-- Objects were uploaded to compliance-docs/<slug> and verified by SHA-256 read-back (2026-10-20).
-- content stays populated until the new code is live; it is cleared in a follow-up step.
alter table public.owner_compliance_docs add column if not exists storage_key text;
alter table public.owner_compliance_docs alter column content drop not null;
alter table public.owner_compliance_docs drop constraint if exists owner_compliance_docs_bytes_present;
alter table public.owner_compliance_docs add constraint owner_compliance_docs_bytes_present check (content is not null or storage_key is not null);
update public.owner_compliance_docs set storage_key = 'compliance-docs/' || slug where storage_key is null;
