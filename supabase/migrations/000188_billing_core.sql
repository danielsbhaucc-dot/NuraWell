-- 000188: product-agnostic billing core (plans/prices in DB, coupons, payments, invoices, usage metering,
-- append-only webhook event log). Every table carries product_id (default 'nurawell') for a multi-product
-- control plane. RLS on everything; writes are service-role only; users may read only their own rows.
-- Additive only: existing subscriptions rows keep their values.

create table if not exists public.billing_plans (
  product_id text not null default 'nurawell',
  code text not null,
  name_he text not null,
  price_agorot integer not null check (price_agorot >= 0),
  billing_interval text not null default 'monthly' check (billing_interval in ('monthly','annual')),
  -- TODO(Daniel): undecided whether listed prices include VAT. Default true until decided.
  prices_include_vat boolean not null default true,
  badge_he text,
  features jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (product_id, code)
);

create table if not exists public.billing_addons (
  product_id text not null default 'nurawell',
  code text not null,
  name_he text not null,
  price_agorot integer not null check (price_agorot >= 0),
  unit text not null,
  quantity integer not null check (quantity > 0),
  prices_include_vat boolean not null default true,
  active boolean not null default true,
  primary key (product_id, code)
);

create table if not exists public.billing_coupons (
  product_id text not null default 'nurawell',
  code text not null,
  percent_off numeric not null check (percent_off > 0 and percent_off <= 100),
  duration_cycles integer check (duration_cycles is null or duration_cycles > 0),
  valid_from timestamptz,
  valid_until timestamptz,
  max_redemptions integer,
  redeemed integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (product_id, code)
);

alter table public.subscriptions add column if not exists product_id text not null default 'nurawell';
alter table public.subscriptions add column if not exists plan_code text;
alter table public.subscriptions add column if not exists coupon_code text;
alter table public.subscriptions add column if not exists coupon_cycles_used integer not null default 0;
alter table public.subscriptions add column if not exists current_period_start timestamptz;
alter table public.subscriptions add column if not exists first_paid_at timestamptz;
alter table public.subscriptions add column if not exists dunning_attempt integer not null default 0;
alter table public.subscriptions add column if not exists dunning_first_failed_at timestamptz;
alter table public.subscriptions add column if not exists next_retry_at timestamptz;
alter table public.subscriptions drop constraint if exists subscriptions_status_check;
alter table public.subscriptions add constraint subscriptions_status_check
  check (status in ('trialing','active','past_due','canceled','expired','ended'));
alter table public.subscriptions drop constraint if exists subscriptions_tier_check;
alter table public.subscriptions add constraint subscriptions_tier_check
  check (tier in ('free','premium','pro','basic','whatsapp','phone'));
create index if not exists idx_subscriptions_product_status on public.subscriptions(product_id, status);
create index if not exists idx_subscriptions_retry on public.subscriptions(next_retry_at) where status = 'past_due';

alter table public.billing_events add column if not exists product_id text not null default 'nurawell';

create table if not exists public.billing_payments (
  id uuid primary key default gen_random_uuid(),
  product_id text not null default 'nurawell',
  user_id uuid references auth.users(id) on delete set null,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  provider text not null,
  provider_payment_id text,
  kind text not null check (kind in ('charge','refund','proration')),
  status text not null check (status in ('succeeded','failed','pending')),
  amount_agorot integer not null,
  vat_agorot integer,
  failure_code text,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  unique (product_id, idempotency_key)
);
create index if not exists idx_billing_payments_user on public.billing_payments(user_id, created_at desc);
create index if not exists idx_billing_payments_failed on public.billing_payments(product_id, created_at desc) where status = 'failed';

create table if not exists public.billing_invoices (
  id uuid primary key default gen_random_uuid(),
  product_id text not null default 'nurawell',
  user_id uuid references auth.users(id) on delete set null,
  payment_id uuid references public.billing_payments(id) on delete set null,
  provider text not null,
  doc_type text not null check (doc_type in ('invoice_receipt','credit_note')),
  doc_number text not null,
  doc_url text,
  total_agorot integer not null,
  vat_agorot integer not null,
  created_at timestamptz not null default now(),
  unique (product_id, provider, doc_number)
);
create index if not exists idx_billing_invoices_user on public.billing_invoices(user_id, created_at desc);

create table if not exists public.billing_usage (
  id bigint generated always as identity primary key,
  product_id text not null default 'nurawell',
  user_id uuid not null references auth.users(id) on delete cascade,
  metric text not null, -- e.g. 'phone_minutes'
  quantity numeric not null,
  source text not null check (source in ('usage','included','purchase','adjustment')),
  period_start date not null,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  unique (product_id, idempotency_key)
);
create index if not exists idx_billing_usage_user on public.billing_usage(user_id, metric, period_start);

-- Append-only provider webhook log: idempotency + replay protection (unique key), payload hash only.
create table if not exists public.billing_webhook_events (
  id bigint generated always as identity primary key,
  product_id text not null default 'nurawell',
  provider text not null,
  idempotency_key text not null,
  kind text not null,
  payload_sha256 text not null,
  outcome text not null default 'received',
  received_at timestamptz not null default now(),
  unique (product_id, provider, idempotency_key)
);
create or replace function public.trg_billing_webhook_append_only()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.outcome is distinct from old.outcome
     and new.idempotency_key = old.idempotency_key and new.payload_sha256 = old.payload_sha256 and new.kind = old.kind then
    return new; -- only outcome may be set once processed
  end if;
  raise exception 'billing_webhook_events is append-only';
end $$;
drop trigger if exists billing_webhook_events_no_mutate on public.billing_webhook_events;
create trigger billing_webhook_events_no_mutate before update or delete on public.billing_webhook_events
  for each row execute function public.trg_billing_webhook_append_only();

-- RLS
do $$ declare t text; begin
  foreach t in array array['billing_plans','billing_addons','billing_coupons','billing_payments','billing_invoices','billing_usage','billing_webhook_events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;
drop policy if exists billing_payments_own on public.billing_payments;
create policy billing_payments_own on public.billing_payments for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists billing_invoices_own on public.billing_invoices;
create policy billing_invoices_own on public.billing_invoices for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists billing_usage_own on public.billing_usage;
create policy billing_usage_own on public.billing_usage for select to authenticated using (user_id = (select auth.uid()));
grant select on public.billing_payments, public.billing_invoices, public.billing_usage to authenticated;

-- Seed Daniel's pricing (agorot). Idempotent.
insert into public.billing_plans (product_id, code, name_he, price_agorot, badge_he, features, sort) values
  ('nurawell','basic','בסיסי',17900,null,'{"almog_chat":true,"journey":true,"whatsapp":false,"phone_minutes":0}',1),
  ('nurawell','whatsapp','וואטסאפ',19900,'הכי משתלם','{"almog_chat":true,"journey":true,"whatsapp":true,"phone_minutes":0}',2),
  ('nurawell','phone','טלפון',44900,null,'{"almog_chat":true,"journey":true,"whatsapp":true,"phone_minutes":30}',3)
on conflict (product_id, code) do nothing;
insert into public.billing_addons (product_id, code, name_he, price_agorot, unit, quantity) values
  ('nurawell','phone_30min','30 דקות שיחה נוספות',12900,'phone_minutes',30)
on conflict (product_id, code) do nothing;
insert into public.billing_coupons (product_id, code, percent_off, duration_cycles) values
  ('nurawell','LAUNCH40',40,3)
on conflict (product_id, code) do nothing;

-- Retention: 'ended' is the new terminal state ('expired' kept as legacy alias).
create or replace function public.retention_purge_due(p_limit int default 200)
returns table (user_id uuid, subscription_id uuid, ended_at timestamptz, choice text, role text, reminder_sent boolean)
language sql stable security definer set search_path = public, pg_temp as $$
  with latest as (
    select distinct on (s.user_id) s.user_id, s.id, s.status, s.ended_at
      from public.subscriptions s
     order by s.user_id, s.created_at desc
  )
  select l.user_id, l.id, l.ended_at, coalesce(p.post_sub_retention, 'keep_24m'), p.role,
         exists (select 1 from public.billing_events b where b.subscription_id = l.id and b.kind = 'retention_purge_notice')
    from latest l
    join public.profiles p on p.id = l.user_id
   where l.status in ('expired','ended') and l.ended_at is not null
     and coalesce(p.role, 'user') in ('user','test')
     and l.ended_at < now() + interval '1 day'
   order by l.ended_at
   limit greatest(1, least(coalesce(p_limit, 200), 1000));
$$;
revoke all on function public.retention_purge_due(int) from public, anon, authenticated;
grant execute on function public.retention_purge_due(int) to service_role;
