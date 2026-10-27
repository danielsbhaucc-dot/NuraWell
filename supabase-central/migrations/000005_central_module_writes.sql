-- Phase 2: the central DB becomes the single source of truth for module on/off (writes, not only reads).
-- * Actors are product-side users (e.g. a NuraWell admin), not central staff: drop the staff FKs that would reject them,
--   and record them in the audit log as actor_ref.
-- * Module changes are guarded like NuraWell's iam_product_modules: no deletes, core stays on, dependencies must be on,
--   an actor is required (except during the one-time sync).
-- * Audit rows now carry the module/license id and a non-sensitive change summary (enabled / state only).
-- * One-time, idempotent sync from a product's own table (marker per product; a second call is a no-op).
-- * Light read for running products: central_module_states(product).

alter table central.product_modules drop constraint if exists product_modules_updated_by_fkey;
alter table central.licenses drop constraint if exists licenses_issued_by_fkey;
alter table central.license_status drop constraint if exists license_status_updated_by_fkey;
comment on column central.product_modules.updated_by is 'product-side user id of the actor (not a central staff id)';
comment on column central.licenses.issued_by is 'product-side user id of the actor (not a central staff id)';
comment on column central.license_status.updated_by is 'product-side user id of the actor (not a central staff id)';

alter table central.audit_log add column if not exists actor_ref uuid;
alter table central.audit_log add column if not exists summary jsonb check (summary is null or jsonb_typeof(summary) = 'object');

create or replace function central.audit_dml() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r jsonb := to_jsonb(coalesce(new, old)); a uuid := nullif(current_setting('central.actor', true), '')::uuid; s jsonb := null;
begin
  if tg_table_name = 'product_modules' then s := jsonb_build_object('enabled', r->'enabled', 'sync', coalesce(current_setting('central.sync', true), '') = 'on');
  elsif tg_table_name = 'license_status' then s := jsonb_build_object('state', case when tg_op = 'DELETE' then 'active' else r->>'state' end);
  end if;
  insert into central.audit_log(actor_staff_id, actor_ref, action, target_table, target_id, product_id, summary)
  values (case when exists (select 1 from central.staff_members m where m.id = a) then a end,
          case when not exists (select 1 from central.staff_members m where m.id = a) then a end,
          lower(tg_op), tg_table_name, coalesce(r->>'id', r->>'module_id'), r->>'product_id', s);
  return coalesce(new, old);
end $$;
revoke all on function central.audit_dml() from public, anon, authenticated;

create or replace function central.product_modules_guard() returns trigger
language plpgsql set search_path = '' as $$
declare sync boolean := coalesce(current_setting('central.sync', true), '') = 'on'; deps text[];
begin
  if tg_op = 'DELETE' then raise exception 'module states are disabled, never deleted'; end if;
  if not sync and new.updated_by is null then raise exception 'actor required'; end if;
  select depends_on into deps from central.modules where id = new.module_id;
  if not sync and new.enabled and exists (select 1 from unnest(deps) d where not exists (
      select 1 from central.product_modules x join central.modules m on m.id = x.module_id
      where x.product_id = new.product_id and x.module_id = d and (x.enabled or m.core))) then
    raise exception 'dependency_disabled';
  end if;
  return new;
end $$;
revoke all on function central.product_modules_guard() from public, anon, authenticated;
create trigger product_modules_guard before insert or update or delete on central.product_modules
  for each row execute function central.product_modules_guard();

create table central.module_sync_markers (
  product_id text primary key references central.products(id) on delete cascade,
  synced_at timestamptz not null default now(),
  rows_synced int not null,
  actor_ref uuid
);
alter table central.module_sync_markers enable row level security;
alter table central.module_sync_markers force row level security;
create policy deny_api_roles on central.module_sync_markers as restrictive for all to anon, authenticated using (false) with check (false);
revoke all on central.module_sync_markers from public, anon, authenticated;
grant select on central.module_sync_markers to service_role;
create trigger module_sync_markers_audit after insert or update or delete on central.module_sync_markers for each row execute function central.audit_dml();

create or replace function public.central_set_module_state(p_actor uuid, p_product text, p_module text, p_enabled boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_actor is null then raise exception 'actor required'; end if;
  perform set_config('central.actor', p_actor::text, true);
  perform set_config('central.sync', '', true);
  insert into central.product_modules(product_id, module_id, enabled, updated_by) values (p_product, p_module, p_enabled, p_actor)
  on conflict (product_id, module_id) do update set enabled = excluded.enabled, updated_by = excluded.updated_by;
end $$;

-- One time per product: copy the product's own module table into central. Second call returns {skipped:true} and changes nothing.
-- Only known modules are taken; core modules always end up on.
create or replace function public.central_sync_module_states(p_actor uuid, p_product text, p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'rows must be an array'; end if;
  perform 1 from central.products where id = p_product for update;
  if not found then raise exception 'unknown product'; end if;
  if exists (select 1 from central.module_sync_markers where product_id = p_product) then
    return jsonb_build_object('skipped', true, 'syncedAt', (select synced_at from central.module_sync_markers where product_id = p_product));
  end if;
  perform set_config('central.actor', coalesce(p_actor::text, ''), true);
  perform set_config('central.sync', 'on', true);
  insert into central.product_modules(product_id, module_id, enabled, updated_by)
  select p_product, m.id, (r->>'enabled')::boolean or m.core, p_actor
  from jsonb_array_elements(p_rows) r join central.modules m on m.id = r->>'moduleId'
  on conflict (product_id, module_id) do update set enabled = excluded.enabled, updated_by = excluded.updated_by;
  get diagnostics n = row_count;
  insert into central.module_sync_markers(product_id, rows_synced, actor_ref) values (p_product, n, p_actor);
  perform set_config('central.sync', '', true);
  return jsonb_build_object('skipped', false, 'rows', n);
end $$;

-- Hot path for running products (cached by the caller): states + which modules are core.
create or replace function public.central_module_states(p_product text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'productStatus', (select status from central.products where id = p_product),
    'core', coalesce((select jsonb_agg(id order by id) from central.modules where core), '[]'),
    'states', coalesce((select jsonb_agg(jsonb_build_object('moduleId', s.module_id, 'enabled', s.enabled) order by s.module_id)
                        from central.product_modules s where s.product_id = p_product), '[]'),
    'synced', exists (select 1 from central.module_sync_markers where product_id = p_product))
$$;

do $$ declare f text; begin
  foreach f in array array['central_set_module_state(uuid,text,text,boolean)','central_sync_module_states(uuid,text,jsonb)','central_module_states(text)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
