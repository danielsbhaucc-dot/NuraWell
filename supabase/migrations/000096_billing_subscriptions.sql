-- 000096: SaaS billing foundation (provider-agnostic). Tiers/prices live in code (lib/billing/tiers.ts).
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tier text not null check (tier in ('free','premium','pro')),
  billing_interval text check (billing_interval in ('monthly','annual')),
  status text not null check (status in ('trialing','active','past_due','canceled','expired')),
  provider text not null default 'none',
  provider_ref text,
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_subscriptions_user on public.subscriptions(user_id, created_at desc);
create index if not exists idx_subscriptions_status on public.subscriptions(status, current_period_end);
create unique index if not exists uq_subscriptions_provider_ref on public.subscriptions(provider, provider_ref) where provider_ref is not null;
-- one free trial per user, ever
create unique index if not exists uq_subscriptions_one_trial on public.subscriptions(user_id) where trial_ends_at is not null;

create table if not exists public.billing_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  kind text not null,               -- trial_started, checkout_started, activated, renewed, canceled, expired, payment_failed, trial_ending_notice, expiring_notice
  provider text not null default 'none',
  provider_event_id text,
  amount_ils numeric,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create unique index if not exists uq_billing_events_provider_event on public.billing_events(provider, provider_event_id) where provider_event_id is not null;
create index if not exists idx_billing_events_user on public.billing_events(user_id, created_at desc);
create index if not exists idx_billing_events_sub on public.billing_events(subscription_id);
create unique index if not exists uq_billing_events_notice on public.billing_events(subscription_id, kind) where kind in ('trial_ending_notice','expiring_notice');

alter table public.subscriptions enable row level security;
alter table public.billing_events enable row level security;
drop policy if exists subscriptions_select_own on public.subscriptions;
create policy subscriptions_select_own on public.subscriptions for select to authenticated using (user_id = (select auth.uid()));
-- writes only via server (service role); billing_events: no client access
