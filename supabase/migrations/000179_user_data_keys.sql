-- Per-user data keys for field envelope encryption (docs/security/FIELD_ENCRYPTION_DESIGN.md).
-- One row per user: the user's DEK wrapped by FIELD_KEK (derived server-side from the KMS-loaded key).
-- Never readable by anon/authenticated. Deleting the user cascades here = crypto-shred of every enc:v2 value.
create table if not exists public.user_data_keys (
  user_id uuid primary key references auth.users(id) on delete cascade,
  wrapped jsonb not null,
  kek_version int not null default 1,
  created_at timestamptz not null default now(),
  rotated_at timestamptz
);

alter table public.user_data_keys enable row level security;
alter table public.user_data_keys force row level security;
revoke all on public.user_data_keys from public, anon, authenticated;
grant select, insert, update, delete on public.user_data_keys to service_role;

comment on table public.user_data_keys is 'Wrapped per-user DEKs (enc:v2 field encryption). Service role only. No plaintext keys.';
