-- 000192: logs + QC as per-product modules.
-- Every ops log table carries product_id (default 'nurawell', FK to iam_products). Adding a column with a constant
-- default is metadata-only: no row rewrite, no data change, no hash chain touched (none of these tables hash rows).
-- New products write their own id; the console filters by the selected product.
do $$
declare t text;
begin
  foreach t in array array['admin_audit_log','ceo_audit_log','error_events','legal_access_log','notify_quality_events',
                           'ops_security_events','delivery_log','ai_usage_events','auth_session_trail'] loop
    if to_regclass('public.' || t) is not null and not exists (
        select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = 'product_id') then
      execute format('alter table public.%I add column product_id text not null default %L', t, 'nurawell');
      execute format('alter table public.%I add constraint %I foreign key (product_id) references public.iam_products(id) not valid', t, t || '_product_fk');
      execute format('alter table public.%I validate constraint %I', t, t || '_product_fk');
      execute format('create index if not exists %I on public.%I (product_id)', t || '_product_idx', t);
    end if;
  end loop;
end $$;

-- QC module ("בקרת איכות"): registered like any other module, enabled for nurawell. New products get it off by default.
select set_config('iam.bootstrap', 'on', true);
insert into public.iam_modules (id, name, core, depends_on) values ('qc', 'בקרת איכות', false, array['logs'])
  on conflict (id) do nothing;
insert into public.iam_product_modules (product_id, module_id, enabled) values ('nurawell', 'qc', true)
  on conflict (product_id, module_id) do nothing;
select set_config('iam.bootstrap', 'off', true);
