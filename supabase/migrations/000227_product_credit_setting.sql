-- Per-product "powered by" credit setting (owned products only; customers follow the white_label entitlement).
-- null = product default (owned: off). Additive, nullable, no backfill.
alter table public.iam_products add column if not exists credit_enabled boolean;
comment on column public.iam_products.credit_enabled is 'Owner toggle for the powered-by credit on owned products. null = default (off). Ignored for customer products.';
