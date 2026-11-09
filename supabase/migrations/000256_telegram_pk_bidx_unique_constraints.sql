-- Promote partial unique indexes to UNIQUE constraints so PostgREST onConflict works.
-- PostgreSQL UNIQUE allows multiple NULLs (legacy pre-backfill rows). New writers always set bidx.
-- Does not drop chat_id/from_id columns or their CHECKs. Reversible: drop constraint, recreate partial uidx.

drop index if exists public.gideon_stranger_sim_chat_bidx_uidx;
alter table public.gideon_stranger_sim drop constraint if exists gideon_stranger_sim_chat_bidx_key;
alter table public.gideon_stranger_sim add constraint gideon_stranger_sim_chat_bidx_key unique (chat_bidx);

drop index if exists public.gideon_telegram_identities_from_bidx_uidx;
alter table public.gideon_telegram_identities drop constraint if exists gideon_telegram_identities_from_bidx_key;
alter table public.gideon_telegram_identities add constraint gideon_telegram_identities_from_bidx_key unique (from_bidx);
