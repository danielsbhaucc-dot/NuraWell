-- Central CRM: customer files (תיק לקוחות). Private `central` schema, RLS deny-all, access only via security-definer RPCs
-- granted to service_role. The app server checks staff permissions (crm.read / crm.write; platform.founder has '*') first.
-- PII (contact name/email/phone) is stored ONLY as @platform/security-crypto envelopes (AES-256-GCM, app-side keys) plus an
-- HMAC blind index for email lookup. No payment provider yet: payments/invoices are placeholders.
create table if not exists central.customers (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (length(display_name) between 1 and 200), -- business name (not a person's PII)
  kind text not null default 'business' check (kind in ('business', 'internal')),
  status text not null default 'active' check (status in ('lead', 'active', 'paused', 'churned')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table central.products add column if not exists customer_id uuid references central.customers(id);
alter table central.product_entitlements add column if not exists status text not null default 'active' check (status in ('active', 'past_due', 'expired', 'canceled'));
alter table central.product_entitlements add column if not exists starts_at timestamptz not null default now();
alter table central.product_entitlements add column if not exists renews_at timestamptz;

create table if not exists central.customer_contacts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references central.customers(id) on delete cascade,
  role text not null default 'billing' check (role in ('owner', 'billing', 'technical', 'other')),
  name_enc text not null, email_enc text, phone_enc text, email_bidx text,
  created_at timestamptz not null default now()
);
create index if not exists customer_contacts_bidx on central.customer_contacts(email_bidx);
create table if not exists central.customer_notes (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references central.customers(id) on delete cascade,
  author_id uuid not null, body text not null check (length(body) between 1 and 4000), created_at timestamptz not null default now()
);
create table if not exists central.customer_invoices ( -- placeholder until a payment provider exists
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references central.customers(id) on delete cascade,
  product_id text references central.products(id), amount_minor bigint not null check (amount_minor >= 0), currency text not null default 'ILS',
  status text not null default 'draft' check (status in ('draft', 'open', 'paid', 'void', 'uncollectible')),
  period_start timestamptz, period_end timestamptz, provider text, provider_ref text,
  created_at timestamptz not null default now()
);
create table if not exists central.customer_timeline ( -- append-only history
  id bigint generated always as identity primary key,
  customer_id uuid not null references central.customers(id) on delete cascade,
  actor_id uuid, event text not null, detail jsonb not null default '{}', at timestamptz not null default now()
);
create or replace function central.timeline_append_only() returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'customer_timeline is append-only'; end $$;
drop trigger if exists customer_timeline_no_change on central.customer_timeline;
create trigger customer_timeline_no_change before update or delete on central.customer_timeline
  for each row execute function central.timeline_append_only();

do $$ declare t text; begin
  foreach t in array array['customers','customer_contacts','customer_notes','customer_invoices','customer_timeline'] loop
    execute format('alter table central.%I enable row level security', t);
    execute format('revoke all on central.%I from anon, authenticated', t);
  end loop; end $$;

-- Read a full customer file (contacts stay encrypted; the app decrypts only for authorized staff).
create or replace function public.central_crm_customer_file(p_customer uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'customer', (select to_jsonb(c) from central.customers c where c.id = p_customer),
    'products', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'status', p.status, 'ownedByUs', p.owned_by_us,
        'entitlements', coalesce((select jsonb_agg(to_jsonb(e) || jsonb_build_object('active', central.entitlement_active(e)) order by e.module_id)
                                  from central.product_entitlements e where e.product_id = p.id), '[]')) order by p.id)
        from central.products p where p.customer_id = p_customer), '[]'),
    'contacts', coalesce((select jsonb_agg(to_jsonb(k) - 'email_bidx') from central.customer_contacts k where k.customer_id = p_customer), '[]'),
    'notes', coalesce((select jsonb_agg(to_jsonb(n) order by n.created_at desc) from central.customer_notes n where n.customer_id = p_customer), '[]'),
    'invoices', coalesce((select jsonb_agg(to_jsonb(i) order by i.created_at desc) from central.customer_invoices i where i.customer_id = p_customer), '[]'),
    'timeline', coalesce((select jsonb_agg(to_jsonb(t) order by t.at desc) from central.customer_timeline t where t.customer_id = p_customer), '[]'))
$$;
create or replace function public.central_crm_list() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.display_name, 'status', c.status,
    'products', (select count(*) from central.products p where p.customer_id = c.id)) order by c.display_name), '[]')
  from central.customers c
$$;
-- Upsert an entitlement (license type, status, dates) and log it on the timeline.
create or replace function public.central_crm_set_entitlement(p_actor uuid, p_product text, p_module text, p_license_type text,
  p_status text, p_paid_through timestamptz, p_renews_at timestamptz, p_grace_days int default 3, p_source text default 'purchase')
returns void language plpgsql security definer set search_path = '' as $$
declare v_customer uuid;
begin
  if p_actor is null then raise exception 'actor required'; end if;
  select customer_id into v_customer from central.products where id = p_product;
  insert into central.product_entitlements as e (product_id, module_id, license_type, source, paid_through, grace_days, status, renews_at, revoked)
  values (p_product, p_module, p_license_type, p_source, p_paid_through, p_grace_days, p_status, p_renews_at, p_status = 'canceled')
  on conflict (product_id, module_id) do update set license_type = excluded.license_type, source = excluded.source,
    paid_through = excluded.paid_through, grace_days = excluded.grace_days, status = excluded.status, renews_at = excluded.renews_at,
    revoked = excluded.revoked, updated_at = now();
  if v_customer is not null then
    insert into central.customer_timeline (customer_id, actor_id, event, detail)
    values (v_customer, p_actor, 'entitlement_set', jsonb_build_object('product', p_product, 'module', p_module, 'licenseType', p_license_type, 'status', p_status));
  end if;
end $$;
create or replace function public.central_crm_add_note(p_actor uuid, p_customer uuid, p_body text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_actor is null then raise exception 'actor required'; end if;
  insert into central.customer_notes (customer_id, author_id, body) values (p_customer, p_actor, p_body);
  insert into central.customer_timeline (customer_id, actor_id, event) values (p_customer, p_actor, 'note_added');
end $$;

-- 'expired'/'canceled' status also ends access (on top of paid_through + grace for subscriptions).
create or replace function central.entitlement_active(e central.product_entitlements) returns boolean
language sql stable set search_path = '' as $$
  select not e.revoked and e.status not in ('expired', 'canceled')
     and (e.license_type = 'perpetual' or e.paid_through + make_interval(days => e.grace_days) >= now())
$$;

do $$ declare f text; begin
  foreach f in array array['central_crm_customer_file(uuid)','central_crm_list()',
    'central_crm_set_entitlement(uuid,text,text,text,text,timestamptz,timestamptz,int,text)','central_crm_add_note(uuid,uuid,text)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop; end $$;
