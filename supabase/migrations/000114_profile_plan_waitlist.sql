-- Display-only subscription plan (no payment, no enforcement yet). Prices live in apps/web/lib/billing/plans.ts.
alter table public.profiles add column if not exists plan text not null default 'basic';
do $$ begin
  alter table public.profiles add constraint profiles_plan_check check (plan in ('basic','whatsapp','premium'));
exception when duplicate_object then null; end $$;

create table if not exists public.plan_waitlist (
  user_id uuid not null references auth.users(id) on delete cascade,
  plan text not null check (plan in ('basic','whatsapp','premium','extra_minutes')),
  billing_interval text not null default 'monthly' check (billing_interval in ('monthly','annual')),
  created_at timestamptz not null default now(),
  primary key (user_id, plan)
);
alter table public.plan_waitlist enable row level security;
-- No client policies: written only by the server (service role).
