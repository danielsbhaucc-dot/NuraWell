-- Platform IAM: one admin console for many products. Product-agnostic.
-- platform → products → roles → permissions → grants (optionally time-limited).
-- Deny by default. Anti-escalation and audit are enforced HERE (triggers), not only in the app:
-- even a buggy route or a leaked service-role key used through the app cannot grant the founder role,
-- self-grant, or rewrite/delete history.

create table if not exists public.iam_products (
  id text primary key check (id ~ '^[a-z][a-z0-9-]{1,30}$'),
  name text not null check (char_length(name) between 1 and 60),
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now()
);

create table if not exists public.iam_roles (
  id text primary key check (id ~ '^[a-z][a-z0-9-]*\.[a-z][a-z0-9_-]*$'),
  product_id text references public.iam_products(id),          -- null = platform role (all products)
  label text not null,
  owner_level boolean not null default false,
  max_duration interval,                                         -- null = may be permanent
  check ((product_id is null) = (id like 'platform.%'))
);

create table if not exists public.iam_role_permissions (
  role_id text not null references public.iam_roles(id) on delete cascade,
  permission text not null check (permission ~ '^(\*|[a-z][a-z_.]*)$'),
  primary key (role_id, permission)
);

create table if not exists public.iam_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id text not null references public.iam_roles(id),
  product_id text not null,                                      -- '*' only for platform roles
  granted_by uuid references auth.users(id),
  reason text check (char_length(reason) <= 300),
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id)
);
create index if not exists iam_grants_user_active on public.iam_grants (user_id) where revoked_at is null;

create table if not exists public.iam_audit_log (
  seq bigserial primary key,
  at timestamptz not null default now(),
  kind text not null check (char_length(kind) <= 40),           -- grant | revoke | deny | elevate | expire | product
  actor_id uuid,
  product_id text,
  target text check (char_length(target) <= 200),
  detail jsonb not null default '{}'::jsonb check (pg_column_size(detail) <= 4000),
  prev_hash text,
  hash text not null default ''
);

-- ── Tamper-evident audit: hash chain + append-only (no UPDATE/DELETE, not even service role) ──
create or replace function public.iam_audit_chain() returns trigger
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare prev text;
begin
  perform pg_advisory_xact_lock(hashtext('iam_audit_log'));
  select hash into prev from public.iam_audit_log order by seq desc limit 1;
  new.at := now();
  new.prev_hash := prev;
  new.hash := encode(extensions.digest(coalesce(prev, '') || '|' || new.seq::text || '|' || ((extract(epoch from new.at) * 1000000)::bigint)::text || '|' || new.kind || '|' ||
    coalesce(new.actor_id::text, '') || '|' || coalesce(new.product_id, '') || '|' || coalesce(new.target, '') || '|' || new.detail::text, 'sha256'), 'hex');
  return new;
end $$;
drop trigger if exists iam_audit_chain on public.iam_audit_log;
create trigger iam_audit_chain before insert on public.iam_audit_log for each row execute function public.iam_audit_chain();

create or replace function public.iam_audit_immutable() returns trigger language plpgsql as $$
begin raise exception 'iam_audit_log is append-only'; end $$;
drop trigger if exists iam_audit_immutable on public.iam_audit_log;
create trigger iam_audit_immutable before update or delete on public.iam_audit_log for each row execute function public.iam_audit_immutable();
drop trigger if exists iam_audit_no_truncate on public.iam_audit_log;
create trigger iam_audit_no_truncate before truncate on public.iam_audit_log for each statement execute function public.iam_audit_immutable();

-- Verify the chain from SQL (read-only). Returns the first broken seq, or null when intact.
create or replace function public.iam_audit_verify() returns bigint
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select min(seq) from (
    select seq, hash, prev_hash, at, kind, actor_id, product_id, target, detail,
           lag(hash) over (order by seq) as expected_prev
    from public.iam_audit_log
  ) t
  where coalesce(prev_hash, '') <> coalesce(expected_prev, '')
     or hash <> encode(extensions.digest(coalesce(prev_hash, '') || '|' || seq::text || '|' || ((extract(epoch from at) * 1000000)::bigint)::text || '|' || kind || '|' ||
        coalesce(actor_id::text, '') || '|' || coalesce(product_id, '') || '|' || coalesce(target, '') || '|' || detail::text, 'sha256'), 'hex');
$$;

-- ── Decision function (used by RLS and by the app as a second opinion) ──
create or replace function public.iam_has_permission(uid uuid, product text, perm text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select uid is not null and exists (
    select 1
    from public.iam_grants g
    join public.iam_roles r on r.id = g.role_id
    join public.iam_role_permissions rp on rp.role_id = r.id
    join public.iam_products p on p.id = product and p.status = 'active'
    where g.user_id = uid
      and g.revoked_at is null
      and (g.expires_at is null or g.expires_at > now())
      and ((g.product_id = '*' and r.product_id is null) or (g.product_id = product and r.product_id = product))
      and (rp.permission = '*' or rp.permission = perm)
  );
$$;

create or replace function public.iam_is_founder(uid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select uid is not null and exists (
    select 1 from public.iam_grants g
    where g.user_id = uid and g.role_id = 'platform.founder' and g.product_id = '*'
      and g.revoked_at is null and (g.expires_at is null or g.expires_at > now())
  );
$$;

-- Caller-only variant for RLS / clients: can never probe another user's access.
create or replace function public.iam_my_permission(product text, perm text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.iam_has_permission(auth.uid(), product, perm);
$$;

-- ── Anti-escalation guard on every grant change ──
create or replace function public.iam_grants_guard() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.iam_roles; bootstrap boolean := coalesce(current_setting('iam.bootstrap', true), '') = 'on'; actor uuid;
begin
  if tg_op = 'DELETE' then
    raise exception 'iam_grants rows are never deleted; revoke instead';
  end if;
  if tg_op = 'UPDATE' then
    if (new.id, new.user_id, new.role_id, new.product_id, new.granted_by, new.created_at, new.expires_at, coalesce(new.reason,''))
       is distinct from (old.id, old.user_id, old.role_id, old.product_id, old.granted_by, old.created_at, old.expires_at, coalesce(old.reason,'')) then
      raise exception 'iam_grants: only revocation is allowed';
    end if;
    if old.revoked_at is not null then raise exception 'iam_grants: already revoked'; end if;
    if new.revoked_at is null then return new; end if;
    actor := new.revoked_by;
  else
    actor := new.granted_by;
  end if;

  select * into r from public.iam_roles where id = new.role_id;
  if r.id is null then raise exception 'iam: unknown role'; end if;

  if r.product_id is null and new.product_id <> '*' then raise exception 'iam: platform role needs product *'; end if;
  if r.product_id is not null and new.product_id <> r.product_id then raise exception 'iam: role/product mismatch'; end if;

  if r.id = 'platform.founder' then
    if not bootstrap then raise exception 'iam: founder role changes only through a reviewed migration'; end if;
    return new;
  end if;

  if actor is null then raise exception 'iam: actor required'; end if;
  if actor = new.user_id then raise exception 'iam: no self grant/revoke'; end if;

  if tg_op = 'INSERT' and r.max_duration is not null then
    if new.expires_at is null or new.expires_at <= now() or new.expires_at > now() + r.max_duration then
      raise exception 'iam: time-limited role needs expires_at within %', r.max_duration;
    end if;
  end if;

  if r.owner_level then
    if not public.iam_is_founder(actor) then raise exception 'iam: owner-level roles are founder-only'; end if;
  elsif not (public.iam_is_founder(actor) or public.iam_has_permission(actor, new.product_id, 'iam.grant')) then
    raise exception 'iam: actor lacks iam.grant on %', new.product_id;
  elsif not public.iam_is_founder(actor) and exists (
      select 1 from public.iam_role_permissions rp where rp.role_id = r.id
      and (rp.permission = '*' or not public.iam_has_permission(actor, new.product_id, rp.permission))) then
    raise exception 'iam: cannot grant more than you hold';
  end if;
  return new;
end $$;
drop trigger if exists iam_grants_guard on public.iam_grants;
create trigger iam_grants_guard before insert or update or delete on public.iam_grants for each row execute function public.iam_grants_guard();

-- DB-side audit of every grant change (cannot be skipped by the app).
create or replace function public.iam_grants_audit() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.iam_audit_log (kind, actor_id, product_id, target, detail)
  values (case when tg_op = 'INSERT' then 'grant' else 'revoke' end,
          case when tg_op = 'INSERT' then new.granted_by else new.revoked_by end,
          new.product_id, new.user_id::text,
          jsonb_build_object('grant_id', new.id, 'role', new.role_id, 'expires_at', new.expires_at, 'reason', new.reason,
                             'bootstrap', coalesce(current_setting('iam.bootstrap', true), '') = 'on'));
  return new;
end $$;
drop trigger if exists iam_grants_audit on public.iam_grants;
create trigger iam_grants_audit after insert or update on public.iam_grants for each row execute function public.iam_grants_audit();

-- Catalog tables are migration-only.
create or replace function public.iam_catalog_readonly() returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('iam.bootstrap', true), '') <> 'on' then raise exception 'iam catalog changes only through a migration'; end if;
  return coalesce(new, old);
end $$;
drop trigger if exists iam_roles_ro on public.iam_roles;
create trigger iam_roles_ro before insert or update or delete on public.iam_roles for each row execute function public.iam_catalog_readonly();
drop trigger if exists iam_role_permissions_ro on public.iam_role_permissions;
create trigger iam_role_permissions_ro before insert or update or delete on public.iam_role_permissions for each row execute function public.iam_catalog_readonly();
drop trigger if exists iam_products_ro on public.iam_products;
create trigger iam_products_ro before insert or update or delete on public.iam_products for each row execute function public.iam_catalog_readonly();

-- ── RLS: deny by default. Users read only their own grants and the products they hold; no client writes. ──
alter table public.iam_products enable row level security;
alter table public.iam_roles enable row level security;
alter table public.iam_role_permissions enable row level security;
alter table public.iam_grants enable row level security;
alter table public.iam_audit_log enable row level security;
revoke all on public.iam_products, public.iam_roles, public.iam_role_permissions, public.iam_grants, public.iam_audit_log from anon, authenticated;
revoke all on sequence public.iam_audit_log_seq_seq from anon, authenticated;
grant select on public.iam_grants, public.iam_products to authenticated;
drop policy if exists iam_grants_own on public.iam_grants;
create policy iam_grants_own on public.iam_grants for select to authenticated using (user_id = auth.uid());
drop policy if exists iam_products_permitted on public.iam_products;
create policy iam_products_permitted on public.iam_products for select to authenticated
  using (public.iam_my_permission(id, 'admin.access'));
revoke execute on function public.iam_has_permission(uuid, text, text), public.iam_is_founder(uuid), public.iam_audit_verify() from public, anon, authenticated;
grant execute on function public.iam_has_permission(uuid, text, text), public.iam_is_founder(uuid) to service_role;
revoke execute on function public.iam_my_permission(text, text) from public, anon;
grant execute on function public.iam_my_permission(text, text) to authenticated, service_role;
grant execute on function public.iam_audit_verify() to service_role;

-- ── Module registry: every capability is a module; enabling it for a product is one toggle ──
create table if not exists public.iam_modules (
  id text primary key check (id ~ '^[a-z][a-z0-9-]{1,40}$'),
  name text not null,
  core boolean not null default false,          -- security-by-default modules: always on, cannot be disabled
  depends_on text[] not null default '{}'
);
create table if not exists public.iam_product_modules (
  product_id text not null references public.iam_products(id),
  module_id text not null references public.iam_modules(id),
  enabled boolean not null default false,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (product_id, module_id)
);

create or replace function public.iam_product_modules_guard() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare m public.iam_modules; bootstrap boolean := coalesce(current_setting('iam.bootstrap', true), '') = 'on';
begin
  if tg_op = 'DELETE' then raise exception 'iam_product_modules: disable instead of delete'; end if;
  select * into m from public.iam_modules where id = new.module_id;
  if m.core and not new.enabled then raise exception 'iam: core security module % cannot be disabled', m.id; end if;
  if not bootstrap then
    if new.updated_by is null or not (public.iam_is_founder(new.updated_by) or public.iam_has_permission(new.updated_by, new.product_id, 'modules.manage')) then
      raise exception 'iam: actor lacks modules.manage on %', new.product_id;
    end if;
  end if;
  if not bootstrap and new.enabled and exists (
      select 1 from unnest(m.depends_on) d
      where not exists (select 1 from public.iam_product_modules x where x.product_id = new.product_id and x.module_id = d and x.enabled)) then
    raise exception 'iam: module % has a disabled dependency', m.id;
  end if;
  new.updated_at := now();
  insert into public.iam_audit_log (kind, actor_id, product_id, target, detail)
  values ('module', new.updated_by, new.product_id, new.module_id, jsonb_build_object('enabled', new.enabled, 'bootstrap', bootstrap));
  return new;
end $$;
drop trigger if exists iam_product_modules_guard on public.iam_product_modules;
create trigger iam_product_modules_guard before insert or update or delete on public.iam_product_modules for each row execute function public.iam_product_modules_guard();
drop trigger if exists iam_modules_ro on public.iam_modules;
create trigger iam_modules_ro before insert or update or delete on public.iam_modules for each row execute function public.iam_catalog_readonly();
alter table public.iam_modules enable row level security;
alter table public.iam_product_modules enable row level security;
revoke all on public.iam_modules, public.iam_product_modules from anon, authenticated;

-- ── Seed (catalog mirrors packages/@platform/iam/src/catalog.ts; a unit test checks they match) ──
select set_config('iam.bootstrap', 'on', false);
insert into public.iam_products (id, name) values ('nurawell', 'NuraWell') on conflict (id) do nothing;
-- IAM-SEED-BEGIN
insert into public.iam_roles (id, product_id, label, owner_level, max_duration) values
  ('platform.founder', null, 'מייסד · כל המוצרים', true, null),
  ('nurawell.owner', 'nurawell', 'בעלים · NuraWell', true, null),
  ('nurawell.admin', 'nurawell', 'מנהל · NuraWell', false, null),
  ('nurawell.content', 'nurawell', 'עורך תוכן · NuraWell', false, null),
  ('nurawell.support', 'nurawell', 'תמיכה · NuraWell', false, null),
  ('nurawell.viewer', 'nurawell', 'צפייה בלבד · NuraWell', false, null),
  ('nurawell.security', 'nurawell', 'אבטחה (זמני) · NuraWell', false, interval '8 hours'),
  ('nurawell.billing', 'nurawell', 'תשלומים (זמני) · NuraWell', false, interval '8 hours'),
  ('nurawell.legal', 'nurawell', 'משפטי (זמני) · NuraWell', false, interval '4 hours')
on conflict (id) do nothing;
insert into public.iam_role_permissions (role_id, permission) values
  ('platform.founder', '*'),
  ('nurawell.owner', '*'),
  ('nurawell.admin', 'admin.access'), ('nurawell.admin', 'content.read'), ('nurawell.admin', 'content.write'), ('nurawell.admin', 'users.read'), ('nurawell.admin', 'users.write'), ('nurawell.admin', 'legal.read'), ('nurawell.admin', 'costs.read'), ('nurawell.admin', 'ai.manage'), ('nurawell.admin', 'settings.manage'), ('nurawell.admin', 'security.read'), ('nurawell.admin', 'billing.read'), ('nurawell.admin', 'iam.read'),
  ('nurawell.content', 'admin.access'), ('nurawell.content', 'content.read'), ('nurawell.content', 'content.write'),
  ('nurawell.support', 'admin.access'), ('nurawell.support', 'users.read'), ('nurawell.support', 'content.read'),
  ('nurawell.viewer', 'admin.access'), ('nurawell.viewer', 'content.read'), ('nurawell.viewer', 'costs.read'), ('nurawell.viewer', 'legal.read'), ('nurawell.viewer', 'security.read'), ('nurawell.viewer', 'billing.read'),
  ('nurawell.security', 'admin.access'), ('nurawell.security', 'security.read'), ('nurawell.security', 'security.manage'), ('nurawell.security', 'legal.read'),
  ('nurawell.billing', 'admin.access'), ('nurawell.billing', 'billing.read'), ('nurawell.billing', 'billing.manage'), ('nurawell.billing', 'costs.read'),
  ('nurawell.legal', 'admin.access'), ('nurawell.legal', 'legal.read'), ('nurawell.legal', 'legal.write'), ('nurawell.legal', 'data.export'), ('nurawell.legal', 'users.pii.read')
on conflict do nothing;
-- IAM-SEED-END
-- MODULES-SEED-BEGIN
insert into public.iam_modules (id, name, core, depends_on) values
  ('security-core', 'אבטחה: כניסה, אימות נוסף, מפתחות וקודי גיבוי', true, '{}'),
  ('iam', 'הרשאות וגישה', true, '{security-core}'),
  ('audit-log', 'יומן ביקורת', true, '{}'),
  ('incident-response', 'תגובה לאירועי אבטחה', true, '{security-core}'),
  ('alerts', 'התראות אבטחה', true, '{}'),
  ('field-encryption', 'הצפנת שדות', true, '{}'),
  ('logs', 'יומנים ומחיקה אוטומטית', true, '{}'),
  ('auth-signup', 'הרשמה וקליטה', false, '{security-core}'),
  ('privacy-retention', 'פרטיות ושמירת מידע', false, '{logs}'),
  ('billing', 'תשלומים ומנויים', false, '{privacy-retention}'),
  ('notifications', 'התראות למשתמשים', false, '{}'),
  ('costs', 'עלויות', false, '{}'),
  ('legal', 'משפטי', false, '{audit-log}'),
  ('a11y', 'נגישות', false, '{}'),
  ('agent', 'מנוע סוכן (אלמוג)', false, '{field-encryption}')
on conflict (id) do nothing;
-- MODULES-SEED-END
insert into public.iam_product_modules (product_id, module_id, enabled)
select 'nurawell', id, true from public.iam_modules
on conflict do nothing;

-- Founder: today's single Ops admin (only when there is exactly one, so nothing is guessed).
insert into public.iam_grants (user_id, role_id, product_id, granted_by, reason)
select p.id, 'platform.founder', '*', null, 'bootstrap: sole existing admin at IAM rollout'
from public.profiles p
where p.role = 'admin'
  and (select count(*) from public.profiles where role = 'admin') = 1
  and not exists (select 1 from public.iam_grants g where g.role_id = 'platform.founder' and g.revoked_at is null);
select set_config('iam.bootstrap', 'off', false);

-- ── Existing RLS now also requires an IAM grant (defense in depth; the founder keeps everything) ──
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and not public.demo_access_blocks_admin(auth.uid())
  ) and public.iam_has_permission(auth.uid(), 'nurawell', 'admin.access');
$$;

create or replace function public.nura_is_admin(uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid
      and lower(btrim(p.role::text)) in ('admin', 'administrator', 'super_admin', 'superadmin', 'owner', 'ops')
      and not public.demo_access_blocks_admin(uid)
  ) and public.iam_has_permission(uid, 'nurawell', 'admin.access');
$$;

-- ── Break-glass v2 (hardened; supersedes 000142) ──────────────────────────────────────────────────
-- Run by the owner from the Supabase SQL editor only (service_role/postgres; never reachable from the app):
--   select * from public.ops_break_glass_reset();
-- The owner is resolved from IAM (the single active platform.founder grant), so adding admins never breaks it.
-- If no active founder exists (should never happen), pass the owner uuid explicitly; that uuid must be a profile
-- admin and the founder grant is restored for it. Resets: trusted devices, pending approvals, handoff tokens,
-- security state (incl. recovery lockout), ALL auth sessions, an auth ban, an active lockdown, automatic IP blocks
-- (manual blocks/ranges only with lift_manual_blocks => true), and revokes ops security keys (a key can approve a
-- new device, so a stolen/attacker key must die). Issues 10 fresh one-time codes into ops_recovery_codes — the
-- table the Ops new-device "recovery" flow redeems via ops_use_recovery_code. Audited in admin_audit_log,
-- iam_audit_log and ops_security_events (the latter drives the Telegram + email alert cron).
drop function if exists public.ops_break_glass_reset(uuid);
create or replace function public.ops_break_glass_reset(owner uuid default null, lift_manual_blocks boolean default false)
returns table (recovery_code text) language plpgsql security definer set search_path = '' as $$
declare
  u uuid := owner; n int; d int; s int; k int; b int := 0; restored boolean := false;
  codes text[] := '{}'; raw text; alpha text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; i int; j int;
begin
  select count(distinct g.user_id) into n from public.iam_grants g
   where g.role_id = 'platform.founder' and g.revoked_at is null and (g.expires_at is null or g.expires_at > now());
  if u is null then
    if n <> 1 then raise exception 'break-glass: % active founders; pass the owner uuid', n; end if;
    select g.user_id into u from public.iam_grants g
     where g.role_id = 'platform.founder' and g.revoked_at is null and (g.expires_at is null or g.expires_at > now()) limit 1;
  elsif not exists (select 1 from public.iam_grants g where g.user_id = u and g.role_id = 'platform.founder'
                      and g.revoked_at is null and (g.expires_at is null or g.expires_at > now())) then
    if n > 0 then raise exception 'break-glass: that user is not the founder'; end if;
    if not exists (select 1 from public.profiles where id = u and role = 'admin') then raise exception 'break-glass: not an admin'; end if;
    perform set_config('iam.bootstrap', 'on', true);
    insert into public.iam_grants (user_id, role_id, product_id, granted_by, reason)
      values (u, 'platform.founder', '*', null, 'break-glass restore');
    perform set_config('iam.bootstrap', 'off', true);
    restored := true;
  end if;
  if not exists (select 1 from auth.users where id = u) then raise exception 'break-glass: no such user'; end if;

  update public.ops_trusted_devices set revoked_at = now() where user_id = u and revoked_at is null;
  get diagnostics d = row_count;
  update public.ops_login_requests set status = 'expired' where user_id = u and status in ('pending', 'approved');
  delete from public.ops_handoff_tokens where user_id = u;
  delete from public.ops_security_state where user_id = u;
  update public.ops_security_keys set revoked_at = now() where user_id = u and revoked_at is null;
  get diagnostics k = row_count;
  delete from auth.sessions where user_id = u;
  get diagnostics s = row_count;
  update auth.users set banned_until = null where id = u and banned_until is not null;
  update public.ops_lockdown set active = false, allow_ip_hash = null, allowlist_until = null, ended_at = now(), ended_via = 'break_glass'
   where id = 1 and active;
  delete from public.ip_blocks where not manual;
  get diagnostics b = row_count;
  if lift_manual_blocks then
    delete from public.ip_blocks;
    delete from public.ip_block_ranges;
  end if;

  for i in 1..10 loop
    raw := '';
    for j in 1..10 loop
      raw := raw || substr(alpha, 1 + (get_byte(extensions.gen_random_bytes(1), 0) % 32), 1);
    end loop;
    codes := codes || (substr(raw, 1, 5) || '-' || substr(raw, 6, 5));
  end loop;
  perform public.ops_set_recovery_codes(u, codes);

  insert into public.admin_audit_log (actor_id, method, path, detail)
    values (null, 'BREAK_GLASS', 'ops_break_glass_reset', jsonb_build_object('user', u, 'devices', d, 'sessions', s, 'keys', k,
      'ip_blocks', b, 'manual_blocks_lifted', lift_manual_blocks, 'founder_restored', restored, 'db_user', current_user));
  insert into public.iam_audit_log (kind, actor_id, product_id, target, detail)
    values ('break_glass', null, '*', u::text, jsonb_build_object('devices', d, 'sessions', s, 'keys', k, 'founder_restored', restored));
  insert into public.ops_security_events (kind, detail)
    values ('break_glass', jsonb_build_object('user', u, 'devices', d, 'sessions', s, 'keys', k));
  return query select unnest(codes);
end $$;
revoke all on function public.ops_break_glass_reset(uuid, boolean) from public, anon, authenticated;
grant execute on function public.ops_break_glass_reset(uuid, boolean) to service_role;
