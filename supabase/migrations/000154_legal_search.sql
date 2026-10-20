-- Instant indexed search across משפטי (media, receipts, licenses, evidence hashes). No AI on normal queries.
create extension if not exists pg_trgm with schema extensions;
alter table public.media_provenance_assets add column if not exists search_text text
  generated always as (lower(coalesce(title,'') || ' ' || coalesce(path,'') || ' ' || coalesce(source_type,'') || ' ' || coalesce(ai_description,'') || ' ' || coalesce(provenance::text,''))) stored;
create index if not exists media_provenance_assets_search_trgm on public.media_provenance_assets using gin (search_text extensions.gin_trgm_ops);
alter table public.media_receipts add column if not exists search_text text
  generated always as (lower(coalesce(vendor,'') || ' ' || coalesce(plan,'') || ' ' || coalesce(subject,'') || ' ' || coalesce(currency,'') || ' ' || coalesce(amount::text,'') || ' ' || coalesce(receipt_date::text,''))) stored;
create index if not exists media_receipts_search_trgm on public.media_receipts using gin (search_text extensions.gin_trgm_ops);
create index if not exists media_provenance_assets_receipts_gin on public.media_provenance_assets using gin ((provenance -> 'receipt_ids'));
