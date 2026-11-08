-- PK telegram ids → UUID surrogate PK + unique keyed bidx; seal chat_id/from_id at rest.
-- Choice: surrogate UUID decouples rotatable crypto index from stable PK (no FKs into these tables).
-- Rollback: restore from backups/pk-telegram-ids-pre-*; or reverse: drop new PK, restore PK on plain/bidx column.
-- Empty or legacy digit rows OK; new writers seal+bidx. Enforcement off.

-- ── gideon_stranger_sim ───────────────────────────────────────────
alter table public.gideon_stranger_sim add column if not exists id uuid;
update public.gideon_stranger_sim set id = gen_random_uuid() where id is null;
alter table public.gideon_stranger_sim alter column id set default gen_random_uuid();
alter table public.gideon_stranger_sim alter column id set not null;

alter table public.gideon_stranger_sim add column if not exists chat_bidx text;

alter table public.gideon_stranger_sim drop constraint if exists gideon_stranger_sim_pkey;
alter table public.gideon_stranger_sim add primary key (id);

alter table public.gideon_stranger_sim drop constraint if exists gideon_stranger_sim_chat_id_check;
alter table public.gideon_stranger_sim add constraint gideon_stranger_sim_chat_id_check check (
  (chat_id like 'enc:v2:%' and char_length(chat_id) <= 4000)
  or (chat_id ~ '^\d{1,20}$')
);

alter table public.gideon_stranger_sim drop constraint if exists gideon_stranger_sim_chat_bidx_check;
alter table public.gideon_stranger_sim add constraint gideon_stranger_sim_chat_bidx_check check (
  chat_bidx is null
  or (char_length(chat_bidx) between 16 and 64 and chat_bidx ~ '^[A-Za-z0-9_-]+$')
);

-- Unique bidx when present (new rows always set it). Legacy null allowed until backfill.
create unique index if not exists gideon_stranger_sim_chat_bidx_uidx
  on public.gideon_stranger_sim (chat_bidx) where chat_bidx is not null;

-- ── gideon_telegram_identities ────────────────────────────────────
alter table public.gideon_telegram_identities add column if not exists id uuid;
update public.gideon_telegram_identities set id = gen_random_uuid() where id is null;
alter table public.gideon_telegram_identities alter column id set default gen_random_uuid();
alter table public.gideon_telegram_identities alter column id set not null;

alter table public.gideon_telegram_identities add column if not exists from_bidx text;

alter table public.gideon_telegram_identities drop constraint if exists gideon_telegram_identities_pkey;
alter table public.gideon_telegram_identities add primary key (id);

alter table public.gideon_telegram_identities drop constraint if exists gideon_telegram_identities_from_id_check;
alter table public.gideon_telegram_identities add constraint gideon_telegram_identities_from_id_check check (
  (from_id like 'enc:v2:%' and char_length(from_id) <= 4000)
  or (from_id ~ '^\d{1,20}$')
);

alter table public.gideon_telegram_identities drop constraint if exists gideon_telegram_identities_from_bidx_check;
alter table public.gideon_telegram_identities add constraint gideon_telegram_identities_from_bidx_check check (
  from_bidx is null
  or (char_length(from_bidx) between 16 and 64 and from_bidx ~ '^[A-Za-z0-9_-]+$')
);

create unique index if not exists gideon_telegram_identities_from_bidx_uidx
  on public.gideon_telegram_identities (from_bidx) where from_bidx is not null;
