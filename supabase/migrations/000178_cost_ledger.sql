-- Smart cost ledger: the existing receipts index (media_receipts) becomes the single store for every
-- vendor receipt/invoice. Adds normalized cost fields (no personal data) + a free daily FX cache.
alter table public.media_receipts add column if not exists dedupe_key text;
alter table public.media_receipts add column if not exists service text;
alter table public.media_receipts add column if not exists cost_kind text check (cost_kind in ('fixed','usage','prepaid'));
alter table public.media_receipts add column if not exists cost_month date;
alter table public.media_receipts add column if not exists fx_rate numeric;
alter table public.media_receipts add column if not exists amount_ils numeric;
alter table public.media_receipts add column if not exists vat_ils numeric;
alter table public.media_receipts add column if not exists normalized_at timestamptz;
-- One row per vendor invoice/receipt number (a re-sent or re-forwarded copy has a new eml hash).
create unique index if not exists media_receipts_dedupe_key_uq on public.media_receipts (dedupe_key) where dedupe_key is not null;
create index if not exists media_receipts_cost_month_idx on public.media_receipts (cost_month);

-- Bank of Israel representative rates (free, public). Cached per day so each rate is fetched once.
create table if not exists public.cost_fx_rates (
  day date not null,
  currency text not null,
  rate_ils numeric not null check (rate_ils > 0),
  source text not null,
  fetched_at timestamptz not null default now(),
  primary key (day, currency)
);
alter table public.cost_fx_rates enable row level security;
revoke all on public.cost_fx_rates from public, anon, authenticated;
grant select, insert, update on public.cost_fx_rates to service_role;
