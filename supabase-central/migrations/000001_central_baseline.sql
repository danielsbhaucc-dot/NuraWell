-- platform-central: security baseline + initial control-plane tables.
-- Holds NO end-user data. Server access only via service_role. Default deny everywhere.

-- 1) Unused APIs off
drop extension if exists pg_graphql;

-- 2) Lock down public + default privileges for API roles
revoke all on schema public from anon, authenticated;
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated, public;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated, public;

-- 3) Private schema (not exposed through the Data API)
create schema if not exists central;
revoke all on schema central from public, anon, authenticated;
grant usage on schema central to service_role;
alter default privileges in schema central revoke all on tables from public, anon, authenticated;
alter default privileges in schema central revoke all on functions from public, anon, authenticated;
alter default privileges in schema central grant select, insert, update, delete on tables to service_role;
alter default privileges in schema central grant usage, select on sequences to service_role;

-- enc:v2 envelope convention (same as NuraWell). Key material lives OUTSIDE this DB, separate keys per DB.
create or replace function central.is_enc_v2(v text) returns boolean
language sql immutable set search_path = '' as $$ select v is null or v like 'enc:v2:%' $$;

-- 4) Products registry
create table central.products (
  id text primary key check (id ~ '^[a-z][a-z0-9_-]{1,40}$'),
  name text not null,
  status text not null default 'active' check (status in ('active','disabled','planned')),
  product_db_ref text,            -- Supabase project ref of the product's own DB (no credentials here)
  created_at timestamptz not null default now()
);

-- 5) Permissions / roles (product-scoped, mirrors @platform/iam)
create table central.permissions (
  id text primary key check (id ~ '^[a-z_]+(\.[a-z_]+)+$'),
  description text not null,
  sensitive boolean not null default false
);
create table central.roles (
  id text primary key,
  label text not null,
  scope text not null check (scope in ('platform','product')),
  owner_level boolean not null default false,
  max_duration interval
);
create table central.role_permissions (
  role_id text not null references central.roles(id) on delete cascade,
  permission_id text not null references central.permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);
create index role_permissions_permission_idx on central.role_permissions(permission_id);

-- 6) Staff / org members. PII only as enc:v2; lookup via keyed blind index computed app-side.
create table central.staff_members (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  kind text not null default 'human' check (kind in ('human','bot','service')),
  status text not null default 'active' check (status in ('active','suspended','offboarded')),
  display_name_enc text check (central.is_enc_v2(display_name_enc)),
  email_enc text check (central.is_enc_v2(email_enc)),
  email_bidx text unique,
  mfa_required boolean not null default true,
  created_at timestamptz not null default now()
);
create table central.staff_grants (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references central.staff_members(id) on delete cascade,
  role_id text not null references central.roles(id),
  product_id text references central.products(id),  -- null = all products (platform roles only)
  granted_by uuid references central.staff_members(id),
  reason text,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index staff_grants_staff_idx on central.staff_grants(staff_id);
create index staff_grants_role_idx on central.staff_grants(role_id);
create index staff_grants_product_idx on central.staff_grants(product_id);
create index staff_grants_granted_by_idx on central.staff_grants(granted_by);

-- platform role <=> all products; product role <=> exactly one product
create or replace function central.check_grant_scope() returns trigger
language plpgsql set search_path = '' as $$
declare s text;
begin
  select scope into s from central.roles where id = new.role_id;
  if s = 'platform' and new.product_id is not null then raise exception 'platform role must not be product-scoped'; end if;
  if s = 'product' and new.product_id is null then raise exception 'product role needs product_id'; end if;
  return new;
end $$;
create trigger staff_grants_scope before insert or update on central.staff_grants
  for each row execute function central.check_grant_scope();

-- 7) Append-only audit log
create table central.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  db_user text not null default current_user,
  actor_staff_id uuid,                 -- set by the app via set_config('central.actor', ...)
  action text not null,
  target_table text,
  target_id text,
  product_id text,
  detail_enc text check (central.is_enc_v2(detail_enc))
);
create index audit_log_at_idx on central.audit_log(at);

create or replace function central.audit_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin raise exception 'audit_log is append-only'; end $$;
create trigger audit_log_no_update before update or delete on central.audit_log
  for each row execute function central.audit_immutable();
create trigger audit_log_no_truncate before truncate on central.audit_log
  for each statement execute function central.audit_immutable();

create or replace function central.audit_dml() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r jsonb := to_jsonb(coalesce(new, old));
begin
  insert into central.audit_log(actor_staff_id, action, target_table, target_id, product_id)
  values (nullif(current_setting('central.actor', true), '')::uuid,
          lower(tg_op), tg_table_name, r->>'id', r->>'product_id');
  return coalesce(new, old);
end $$;
revoke all on function central.audit_dml() from public, anon, authenticated;

do $$ declare t text; begin
  foreach t in array array['products','permissions','roles','role_permissions','staff_members','staff_grants'] loop
    execute format('create trigger %I after insert or update or delete on central.%I for each row execute function central.audit_dml()', t||'_audit', t);
  end loop;
end $$;

-- 8) RLS enabled + forced, explicit deny for API roles, everywhere
do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname = 'central' loop
    execute format('alter table central.%I enable row level security', t);
    execute format('alter table central.%I force row level security', t);
    execute format('create policy deny_api_roles on central.%I as restrictive for all to anon, authenticated using (false) with check (false)', t);
  end loop;
end $$;

grant select, insert, update, delete on all tables in schema central to service_role;
revoke update, delete, truncate on central.audit_log from service_role;
grant usage, select on all sequences in schema central to service_role;

-- 9) No public sign-ups: auth users may only be created by the server with app_metadata.central_invited=true
create or replace function central.block_uninvited_signup() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(new.raw_app_meta_data->>'central_invited', '') <> 'true' then
    raise exception 'sign-ups are disabled';
  end if;
  return new;
end $$;
revoke all on function central.block_uninvited_signup() from public, anon, authenticated;
create trigger central_block_uninvited_signup before insert on auth.users
  for each row execute function central.block_uninvited_signup();

-- Extension points (later phases, same rules: RLS forced, enc:v2 PII, product_id FK, audit trigger):
--   central.customers / customer_products (CRM), central.support_tickets / ticket_messages.
