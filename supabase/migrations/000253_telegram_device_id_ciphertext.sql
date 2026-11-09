-- Coherent group: admin_passkeys.telegram_user_id + gideon_device_requests.chat_id
-- Seal at rest (enc:v2, system:ops) + keyed HMAC *_bidx for equality.
-- Lookups: passkeys by credential_id (ownership via decrypted id or bidx); device_requests eq via chat_bidx.
-- PK unchanged. Stranger_sim.chat_id / gideon_telegram_identities.from_id remain PK=id (next chunk).
-- Legacy plaintext retained until local backfill. Enforcement off. No Telegram API.

alter table public.admin_passkeys add column if not exists telegram_user_bidx text;
alter table public.admin_passkeys drop constraint if exists admin_passkeys_telegram_user_id_check;
alter table public.admin_passkeys add constraint admin_passkeys_telegram_user_id_check check (
  telegram_user_id is null
  or (telegram_user_id like 'enc:v2:%' and char_length(telegram_user_id) <= 4000)
  or (telegram_user_id not like 'enc:%' and char_length(telegram_user_id) between 1 and 64)
);
alter table public.admin_passkeys drop constraint if exists admin_passkeys_telegram_user_bidx_check;
alter table public.admin_passkeys add constraint admin_passkeys_telegram_user_bidx_check check (
  telegram_user_bidx is null
  or (char_length(telegram_user_bidx) between 16 and 64 and telegram_user_bidx ~ '^[A-Za-z0-9_-]+$')
);
create index if not exists admin_passkeys_telegram_user_bidx_idx on public.admin_passkeys (telegram_user_bidx);

alter table public.gideon_device_requests add column if not exists chat_bidx text;
alter table public.gideon_device_requests drop constraint if exists gideon_device_requests_chat_id_check;
alter table public.gideon_device_requests add constraint gideon_device_requests_chat_id_check check (
  chat_id is null
  or (chat_id like 'enc:v2:%' and char_length(chat_id) <= 4000)
  or (chat_id not like 'enc:%' and char_length(chat_id) between 1 and 64)
);
alter table public.gideon_device_requests drop constraint if exists gideon_device_requests_chat_bidx_check;
alter table public.gideon_device_requests add constraint gideon_device_requests_chat_bidx_check check (
  chat_bidx is null
  or (char_length(chat_bidx) between 16 and 64 and chat_bidx ~ '^[A-Za-z0-9_-]+$')
);
create index if not exists gideon_device_requests_chat_bidx_pending_idx
  on public.gideon_device_requests (chat_bidx) where status = 'pending';
