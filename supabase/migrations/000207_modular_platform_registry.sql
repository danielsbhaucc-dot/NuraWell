-- 000207: modular platform phase 1 — product registry, product memberships, per-product metrics for the console,
-- and the sample product ("מוצר לדוגמה") that proves the shared engine/auth/console end to end.
-- Nothing here changes existing tables or forces product_id on them (designed only; see docs/architecture/MODULAR_PLATFORM.he.md).
-- Security: RLS on everywhere, nothing granted to anon, registry + metrics are service-role only.

-- ── 1. Sample product in the IAM catalog (catalog tables are migration-only → bootstrap) ──
select set_config('iam.bootstrap', 'on', true);
insert into public.iam_products (id, name) values ('sample', 'מוצר לדוגמה') on conflict (id) do nothing;
-- IAM-SEED-BEGIN
insert into public.iam_roles (id, product_id, label, owner_level, max_duration) values
  ('sample.owner', 'sample', 'בעלים · מוצר לדוגמה', true, null),
  ('sample.admin', 'sample', 'מנהל · מוצר לדוגמה', false, null),
  ('sample.content', 'sample', 'עורך תוכן · מוצר לדוגמה', false, null),
  ('sample.support', 'sample', 'תמיכה · מוצר לדוגמה', false, null),
  ('sample.viewer', 'sample', 'צפייה בלבד · מוצר לדוגמה', false, null),
  ('sample.security', 'sample', 'אבטחה (זמני) · מוצר לדוגמה', false, interval '8 hours'),
  ('sample.billing', 'sample', 'תשלומים (זמני) · מוצר לדוגמה', false, interval '8 hours'),
  ('sample.legal', 'sample', 'משפטי (זמני) · מוצר לדוגמה', false, interval '4 hours')
on conflict (id) do nothing;
insert into public.iam_role_permissions (role_id, permission) values
  ('sample.owner', '*'),
  ('sample.admin', 'admin.access'), ('sample.admin', 'content.read'), ('sample.admin', 'content.write'), ('sample.admin', 'users.read'), ('sample.admin', 'users.write'), ('sample.admin', 'legal.read'), ('sample.admin', 'costs.read'), ('sample.admin', 'ai.manage'), ('sample.admin', 'settings.manage'), ('sample.admin', 'security.read'), ('sample.admin', 'billing.read'), ('sample.admin', 'iam.read'),
  ('sample.content', 'admin.access'), ('sample.content', 'content.read'), ('sample.content', 'content.write'),
  ('sample.support', 'admin.access'), ('sample.support', 'users.read'), ('sample.support', 'content.read'),
  ('sample.viewer', 'admin.access'), ('sample.viewer', 'content.read'), ('sample.viewer', 'costs.read'), ('sample.viewer', 'legal.read'), ('sample.viewer', 'security.read'), ('sample.viewer', 'billing.read'),
  ('sample.security', 'admin.access'), ('sample.security', 'security.read'), ('sample.security', 'security.manage'), ('sample.security', 'legal.read'),
  ('sample.billing', 'admin.access'), ('sample.billing', 'billing.read'), ('sample.billing', 'billing.manage'), ('sample.billing', 'costs.read'),
  ('sample.legal', 'admin.access'), ('sample.legal', 'legal.read'), ('sample.legal', 'legal.write'), ('sample.legal', 'data.export'), ('sample.legal', 'users.pii.read')
on conflict do nothing;
-- IAM-SEED-END
-- Security core is on by default for every product; the sample also uses the AI engine, costs, signup and QC.
insert into public.iam_product_modules (product_id, module_id, enabled)
select 'sample', id, (core or id in ('agent', 'costs', 'auth-signup', 'qc', 'logs')) from public.iam_modules
on conflict do nothing;
select set_config('iam.bootstrap', 'off', true);

-- ── 2. Product registry: per-product metadata the console and the shared packages need ──
create table if not exists public.platform_product_registry (
  product_id text primary key references public.iam_products(id),
  description text check (char_length(description) <= 300),
  -- Field-encryption key purpose (per-product key separation: a key for one product can never decrypt another's data).
  key_purpose text not null unique check (key_purpose ~ '^field:[a-z][a-z0-9-]{1,30}$'),
  -- 'shared-scoped' = rows live in shared tables scoped by product_id + RLS; 'dedicated' = own tables/schema.
  tenancy text not null default 'shared-scoped' check (tenancy in ('shared-scoped', 'dedicated')),
  created_at timestamptz not null default now()
);
alter table public.platform_product_registry enable row level security;
revoke all on public.platform_product_registry from anon, authenticated, public;
insert into public.platform_product_registry (product_id, description, key_purpose, tenancy) values
  ('nurawell', 'ליווי אישי לירידה במשקל עם אלמוג', 'field:nurawell', 'shared-scoped'),
  ('sample', 'מוצר לדוגמה שמוכיח שמנוע ה-AI, הכניסה ולוח הבקרה משותפים', 'field:sample', 'shared-scoped')
on conflict (product_id) do nothing;

-- ── 3. Product memberships: which user belongs to which product (same login, separate products) ──
create table if not exists public.product_memberships (
  product_id text not null references public.iam_products(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (product_id, user_id)
);
create index if not exists product_memberships_user_idx on public.product_memberships (user_id);
alter table public.product_memberships enable row level security;
revoke all on public.product_memberships from anon, authenticated, public;
grant select on public.product_memberships to authenticated;
drop policy if exists product_memberships_own on public.product_memberships;
create policy product_memberships_own on public.product_memberships for select to authenticated using (user_id = (select auth.uid()));
-- Writes: service role only (signup flow of each product). No client insert/update/delete.

-- ── 4. Per-product numbers for the console (aggregates only, no PII) ──
create or replace function public.platform_product_metrics()
returns table (product_id text, name text, status text, description text, key_purpose text,
               users bigint, ai_cost_30d numeric, ai_calls_30d bigint, errors_7d bigint)
language sql stable security definer set search_path = public, pg_temp as $$
  select p.id, p.name, p.status, r.description, r.key_purpose,
    case when p.id = 'nurawell' then (select count(*) from public.profiles)
         else (select count(*) from public.product_memberships m where m.product_id = p.id) end,
    coalesce((select sum(e.cost_usd) from public.ai_usage_events e where e.product_id = p.id and e.created_at > now() - interval '30 days'), 0),
    (select count(*) from public.ai_usage_events e where e.product_id = p.id and e.created_at > now() - interval '30 days'),
    (select count(*) from public.error_events x where x.product_id = p.id and x.created_at > now() - interval '7 days')
  from public.iam_products p
  left join public.platform_product_registry r on r.product_id = p.id
  order by p.created_at, p.id;
$$;
revoke all on function public.platform_product_metrics() from public, anon, authenticated;
grant execute on function public.platform_product_metrics() to service_role;
