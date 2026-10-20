-- Gmail forwarding-confirmation notices become "resolved" once forwarding is proven to work
-- (a later forwarded mail from an allowed forwarder) or the admin marks it confirmed.
alter table public.media_receipts add column if not exists confirmed_at timestamptz;
