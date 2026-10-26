-- 000003: Phase 1 — product/module registry, module states, licenses and the status-file counter move to platform-central.
-- Source of truth for the hub (/ops/modules) from now on. NuraWell keeps its copies read-only until the switch is verified.
-- Same baseline as 000001: private schema, RLS enabled+forced, restrictive deny for API roles, service_role only,
-- every change audit-logged (append-only), sensitive text only as enc:v2 (encrypted app-side, keys outside this DB).

-- 1) Product registry metadata (was NuraWell public.platform_product_registry)
alter table central.products
  add column if not exists description text check (char_length(description) <= 300),
  add column if not exists key_purpose text unique check (key_purpose ~ '^field:[a-z][a-z0-9-]{1,30}$'),
  add column if not exists tenancy text not null default 'shared-scoped' check (tenancy in ('shared-scoped','dedicated'));

-- 2) Module catalog (was public.iam_modules)
create table central.modules (
  id text primary key check (id ~ '^[a-z][a-z0-9-]{1,40}$'),
  name text not null check (char_length(name) <= 120),
  core boolean not null default false,
  depends_on text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- 3) Which module is on for which product (was public.iam_product_modules)
create table central.product_modules (
  product_id text not null references central.products(id) on delete cascade,
  module_id text not null references central.modules(id) on delete cascade,
  enabled boolean not null default false,
  updated_by uuid references central.staff_members(id),
  updated_at timestamptz not null default now(),
  primary key (product_id, module_id)
);
create index product_modules_module_idx on central.product_modules(module_id);
create index product_modules_updated_by_idx on central.product_modules(updated_by);
-- Core modules can never be switched off.
create or replace function central.core_always_on() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not new.enabled and exists (select 1 from central.modules m where m.id = new.module_id and m.core) then
    raise exception 'core module % cannot be disabled', new.module_id;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger product_modules_core before insert or update on central.product_modules
  for each row execute function central.core_always_on();

-- 4) Licenses (design from gated NuraWell 000216; never applied there, so it starts here)
create table central.licenses (
  id text primary key check (id ~ '^[A-Za-z0-9_~-]{6,80}$'),   -- = lid
  product_id text references central.products(id),              -- product that consumes it (null = sold module)
  module_id text not null,
  version_range text not null check (char_length(version_range) <= 40),
  licensee_ref text not null check (licensee_ref ~ '^[a-z0-9-]{3,40}$'),  -- opaque id, never an email
  licensee_name_enc text check (central.is_enc_v2(licensee_name_enc)),
  domains text[] not null default '{}',
  mode text not null check (mode in ('bundle','source','product')),
  issued_at timestamptz not null default now(),
  expires_at timestamptz,               -- next billing date
  grace_days int not null default 3 check (grace_days between 0 and 90),
  superseded_by text references central.licenses(id),
  issued_by uuid references central.staff_members(id),
  created_at timestamptz not null default now()
);
create index licenses_product_idx on central.licenses(product_id);
create index licenses_superseded_idx on central.licenses(superseded_by);
create index licenses_issued_by_idx on central.licenses(issued_by);

create table central.license_status (
  id text primary key references central.licenses(id) on delete cascade,  -- = lid
  state text not null check (state in ('suspended_until','suspended_until_payment','revoked_permanent')),
  until timestamptz,
  reason_enc text check (central.is_enc_v2(reason_enc)),
  reason_code text check (reason_code in ('unpaid','terms','buyer_request','other')),
  updated_by uuid references central.staff_members(id),
  updated_at timestamptz not null default now(),
  check (state <> 'suspended_until' or until is not null)
);
create index license_status_updated_by_idx on central.license_status(updated_by);

-- Monotonic version of the signed status file (clients reject a lower version: rollback protection)
create table central.status_file_state (
  id smallint primary key default 1 check (id = 1),
  version bigint not null default 0,
  published_at timestamptz
);
insert into central.status_file_state (id, version) values (1, 0);

-- 5) Product instances registered with the control plane (no secrets: only an opaque instance id + hash of its host)
create table central.product_instances (
  id text primary key check (id ~ '^ins_[A-Za-z0-9_-]{8,64}$'),
  product_id text not null references central.products(id) on delete cascade,
  host_sha256 text check (host_sha256 ~ '^[0-9a-f]{64}$'),
  license_id text references central.licenses(id),
  registered_at timestamptz not null default now(),
  last_seen_at timestamptz
);
create index product_instances_product_idx on central.product_instances(product_id);
create index product_instances_license_idx on central.product_instances(license_id);

-- 6) Audit + RLS on every new table
do $$ declare t text; begin
  foreach t in array array['modules','product_modules','licenses','license_status','status_file_state','product_instances'] loop
    execute format('create trigger %I after insert or update or delete on central.%I for each row execute function central.audit_dml()', t||'_audit', t);
    execute format('alter table central.%I enable row level security', t);
    execute format('alter table central.%I force row level security', t);
    execute format('create policy deny_api_roles on central.%I as restrictive for all to anon, authenticated using (false) with check (false)', t);
    execute format('revoke all on central.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on central.%I to service_role', t);
  end loop;
end $$;
-- status counter: only via the bump function
revoke insert, delete on central.status_file_state from service_role;

-- 7) Server-only RPC surface. `central` is not exposed by the Data API, so the hub calls these (service_role only).
create or replace function public.central_hub_snapshot() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'products', coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'status',p.status,'description',p.description) order by p.created_at) from central.products p), '[]'),
    'modules', coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'name',m.name,'core',m.core,'dependsOn',m.depends_on) order by m.id) from central.modules m), '[]'),
    'states', coalesce((select jsonb_agg(jsonb_build_object('productId',s.product_id,'moduleId',s.module_id,'enabled',s.enabled)) from central.product_modules s), '[]'),
    'licenses', coalesce((select jsonb_agg(jsonb_build_object('lid',l.id,'moduleId',l.module_id,'productId',l.product_id,'licensee',l.licensee_ref,'mode',l.mode,'domains',l.domains,'issuedAt',l.issued_at,'expiresAt',l.expires_at,'graceDays',l.grace_days,'state',coalesce(st.state,'active'),'until',st.until) order by l.issued_at desc) from central.licenses l left join central.license_status st on st.id = l.id where l.superseded_by is null), '[]'),
    'statusVersion', (select version from central.status_file_state where id = 1)
  )
$$;

create or replace function public.central_set_module_state(p_actor uuid, p_product text, p_module text, p_enabled boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('central.actor', coalesce(p_actor::text, ''), true);
  insert into central.product_modules(product_id, module_id, enabled, updated_by) values (p_product, p_module, p_enabled, p_actor)
  on conflict (product_id, module_id) do update set enabled = excluded.enabled, updated_by = excluded.updated_by;
end $$;

create or replace function public.central_register_instance(p_product text, p_instance text, p_host_sha256 text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare st text;
begin
  select status into st from central.products where id = p_product;
  if st is null then raise exception 'unknown product'; end if;
  insert into central.product_instances(id, product_id, host_sha256, last_seen_at) values (p_instance, p_product, p_host_sha256, now())
  on conflict (id) do update set last_seen_at = now() where central.product_instances.product_id = excluded.product_id;
  return jsonb_build_object('instanceId', p_instance, 'productStatus', st);
end $$;

create or replace function public.central_save_license(p_actor uuid, p_license jsonb, p_supersedes text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('central.actor', coalesce(p_actor::text, ''), true);
  insert into central.licenses(id, product_id, module_id, version_range, licensee_ref, licensee_name_enc, domains, mode, issued_at, expires_at, grace_days, issued_by)
  values (p_license->>'lid', p_license->>'productId', p_license->>'moduleId', p_license->>'versionRange', p_license->>'licenseeRef', p_license->>'licenseeNameEnc',
          coalesce(array(select jsonb_array_elements_text(p_license->'domains')), '{}'), p_license->>'mode', (p_license->>'issuedAt')::timestamptz,
          (p_license->>'expiresAt')::timestamptz, coalesce((p_license->>'graceDays')::int, 3), p_actor);
  if p_supersedes is not null then
    update central.licenses set superseded_by = p_license->>'lid' where id = p_supersedes and superseded_by is null;
    update central.product_instances set license_id = p_license->>'lid' where license_id = p_supersedes;
  end if;
end $$;

create or replace function public.central_set_license_status(p_actor uuid, p_lid text, p_state text, p_until timestamptz, p_reason_enc text, p_reason_code text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('central.actor', coalesce(p_actor::text, ''), true);
  if p_state = 'active' then
    delete from central.license_status where id = p_lid;
  else
    insert into central.license_status(id, state, until, reason_enc, reason_code, updated_by) values (p_lid, p_state, p_until, p_reason_enc, p_reason_code, p_actor)
    on conflict (id) do update set state = excluded.state, until = excluded.until, reason_enc = excluded.reason_enc, reason_code = excluded.reason_code, updated_by = excluded.updated_by, updated_at = now();
  end if;
end $$;

create or replace function public.central_bump_status_version() returns bigint
language sql security definer set search_path = '' as $$
  update central.status_file_state set version = version + 1, published_at = now() where id = 1 returning version;
$$;

do $$ declare f text; begin
  foreach f in array array['central_hub_snapshot()','central_set_module_state(uuid,text,text,boolean)','central_register_instance(text,text,text)',
    'central_save_license(uuid,jsonb,text)','central_set_license_status(uuid,text,text,timestamptz,text,text)','central_bump_status_version()'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
revoke all on function central.core_always_on() from public, anon, authenticated;

-- 8) Data copied from NuraWell prod (catalog + states + registry; non-PII). Licenses: none existed (gated table never applied).
insert into central.products (id, name, status) values ('sample', 'מוצר לדוגמה', 'active') on conflict (id) do nothing;
update central.products set description = 'ליווי אישי לירידה במשקל עם אלמוג', key_purpose = 'field:nurawell', tenancy = 'shared-scoped' where id = 'nurawell';
update central.products set description = 'מוצר לדוגמה שמוכיח שמנוע ה-AI, הכניסה ולוח הבקרה משותפים', key_purpose = 'field:sample', tenancy = 'shared-scoped' where id = 'sample';
insert into central.modules (id, name, core, depends_on) values
  ('security-core','אבטחה: כניסה, אימות נוסף, מפתחות וקודי גיבוי',true,'{}'),
  ('iam','הרשאות וגישה',true,'{security-core}'),
  ('audit-log','יומן ביקורת',true,'{}'),
  ('incident-response','תגובה לאירועי אבטחה',true,'{security-core}'),
  ('alerts','התראות אבטחה',true,'{}'),
  ('field-encryption','הצפנת שדות',true,'{}'),
  ('logs','יומנים ומחיקה אוטומטית',true,'{}'),
  ('auth-signup','הרשמה וקליטה',false,'{security-core}'),
  ('privacy-retention','פרטיות ושמירת מידע',false,'{logs}'),
  ('billing','תשלומים ומנויים',false,'{privacy-retention}'),
  ('notifications','התראות למשתמשים',false,'{}'),
  ('costs','עלויות',false,'{}'),
  ('legal','משפטי',false,'{audit-log}'),
  ('a11y','נגישות',false,'{}'),
  ('agent','מנוע סוכן (אלמוג)',false,'{field-encryption}'),
  ('qc','בקרת איכות',false,'{logs}')
on conflict (id) do nothing;
insert into central.product_modules (product_id, module_id, enabled)
select 'nurawell', id, true from central.modules
union all
select 'sample', id, (core or id in ('auth-signup','costs','agent','qc')) from central.modules
on conflict do nothing;
