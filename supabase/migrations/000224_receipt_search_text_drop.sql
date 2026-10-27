-- 000224 (apply AFTER the 000222 app deploy is READY, search_bidx backfilled and search parity verified):
-- media_receipts.search_text was a generated plaintext copy of vendor/plan/subject/currency/amount. Receipt search
-- now runs in the app on search_bidx (keyed-HMAC trigram/word tokens) + decrypted post-filter
-- (lib/legal/media/receipt-search.ts), so the receipt branch of legal_hub_fuzzy and the column are removed.
create or replace function public.legal_hub_fuzzy(p_q text, p_limit integer default 30)
returns table(kind text, id text, score real)
language sql stable security definer set search_path to 'public', 'extensions' as $function$
  select 'asset', asset_key, greatest(word_similarity(p_q, coalesce(search_text,'')), similarity(p_q, coalesce(title,'')))
    from media_provenance_assets
   where present and (p_q <% coalesce(search_text,'') or coalesce(title,'') % p_q or search_text ilike '%'||p_q||'%')
  order by 3 desc limit greatest(1, least(p_limit, 100));
$function$;

do $d$ declare i text; begin
  for i in select indexname from pg_indexes where schemaname = 'public' and tablename = 'media_receipts' and indexdef ilike '%search_text%' loop
    execute format('drop index if exists public.%I', i);
  end loop;
end $d$;
alter table public.media_receipts drop column if exists search_text;
