-- Gideon auto-consult: findings + capability requests go to Or automatically.
-- kind: finding | capability_request. risk: low (Or may implement) | sensitive (needs Daniel: approval).
alter table public.ceo_dev_forwards
  add column if not exists kind text not null default 'finding' check (kind in ('finding', 'capability_request')),
  add column if not exists risk text not null default 'low' check (risk in ('low', 'sensitive')),
  add column if not exists approval text not null default 'not_needed' check (approval in ('not_needed', 'pending', 'approved', 'rejected')),
  add column if not exists fingerprint text;
create index if not exists ceo_dev_forwards_fp_idx on public.ceo_dev_forwards (fingerprint) where status in ('new', 'in_progress');
