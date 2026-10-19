-- Gideon: Daniel's standing instructions ("don't message me on Shabbat", quiet hours, mute a topic, notes),
-- enforced in code at the single Telegram send layer, plus an outbox for messages held during quiet time.
-- Service-role only (RLS on, no policies), like the other Gideon tables.
create table if not exists public.gideon_owner_prefs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('shabbat', 'quiet_hours', 'quiet_until', 'mute_topic', 'note')),
  label text not null check (char_length(label) between 1 and 300),
  params jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  source text not null default 'ops' check (source in ('gideon', 'ops', 'system')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- one Shabbat rule (its params hold city / candle-lighting minutes / Yom Tov / emergencies policy)
create unique index if not exists gideon_owner_prefs_one_shabbat on public.gideon_owner_prefs (kind) where kind = 'shabbat';
alter table public.gideon_owner_prefs enable row level security;
revoke all on public.gideon_owner_prefs from anon, authenticated;

create table if not exists public.gideon_outbox (
  id bigint generated always as identity primary key,
  chat_id text not null,
  kind text not null,
  topic text,
  text text not null,
  buttons jsonb,
  reason text,
  status text not null default 'held' check (status in ('held', 'sending')),
  deliver_after timestamptz not null,
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists gideon_outbox_status on public.gideon_outbox (status, created_at);
alter table public.gideon_outbox enable row level security;
revoke all on public.gideon_outbox from anon, authenticated;

-- Daniel asked (16/10/2026, Telegram): no messages on Shabbat. Active now; emergencies held too (default).
insert into public.gideon_owner_prefs (kind, label, params, active, source)
values ('shabbat', 'לא לשלוח לי הודעות בשבת (מכניסת שבת עד צאת שבת)', '{"city":"Jerusalem","candle_mins":40,"yom_tov":true,"emergencies":"hold"}'::jsonb, true, 'system')
on conflict do nothing;
