-- Gmail forwarding-confirmation one-click link, shown in Ops.
alter table public.media_receipts add column if not exists confirmation_link text;
