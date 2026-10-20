-- One receipt per original file: the bundle import used check-then-insert, and two concurrent
-- queue drains (panel open + scheduled run) inserted every receipt twice on 2026-10-20.
create unique index if not exists media_receipts_eml_sha_uq on public.media_receipts (eml_sha) where eml_sha is not null;
-- Queue claim marker so a bundle is drained by exactly one worker.
alter table public.media_import_queue add column if not exists claimed_at timestamptz;
