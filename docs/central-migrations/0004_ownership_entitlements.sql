-- Central (platform-core) schema: product ownership + per-module entitlements with a license type.
-- Owned-by-us products: every module always works for users (licensing at most raises an admin alert).
-- Customer products: only entitled modules work. subscription → locks when paid_through + grace_days has passed;
-- perpetual → works forever (updates_until is informational only, nothing enforces it yet).
alter table central.products add column if not exists owned_by_us boolean not null default false;
update central.products set owned_by_us = true where id in ('nurawell', 'sample');

create table if not exists central.product_entitlements (
  product_id text not null references central.products(id) on delete cascade,
  module_id text not null references central.modules(id) on delete cascade,
  license_type text not null check (license_type in ('subscription', 'perpetual')),
  source text not null default 'purchase' check (source in ('purchase', 'grant')),
  paid_through timestamptz,
  grace_days int not null default 3 check (grace_days between 0 and 30),
  updates_until timestamptz,
  revoked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (product_id, module_id),
  check (license_type = 'perpetual' or paid_through is not null)
);
alter table central.product_entitlements enable row level security;
revoke all on central.product_entitlements from anon, authenticated;

create or replace function central.entitlement_active(e central.product_entitlements) returns boolean
language sql stable set search_path = '' as $$
  select not e.revoked and (e.license_type = 'perpetual' or e.paid_through + make_interval(days => e.grace_days) >= now())
$$;

create or replace function public.central_module_states(p_product text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'productStatus', (select status from central.products where id = p_product),
    'ownedByUs', coalesce((select owned_by_us from central.products where id = p_product), false),
    'core', coalesce((select jsonb_agg(id order by id) from central.modules where core), '[]'),
    'states', coalesce((select jsonb_agg(jsonb_build_object('moduleId', s.module_id, 'enabled', s.enabled) order by s.module_id)
                        from central.product_modules s where s.product_id = p_product), '[]'),
    'entitlements', coalesce((select jsonb_agg(jsonb_build_object('moduleId', e.module_id, 'licenseType', e.license_type, 'source', e.source,
                        'paidThrough', e.paid_through, 'graceDays', e.grace_days, 'updatesUntil', e.updates_until,
                        'active', central.entitlement_active(e)) order by e.module_id)
                        from central.product_entitlements e where e.product_id = p_product), '[]'),
    'synced', exists (select 1 from central.module_sync_markers where product_id = p_product))
$$;
