-- Supabase advisor 0011 (function_search_path_mutable): pin search_path on the pure helper from 000225.
-- Body is a CASE over literals and references no objects, so an empty search_path is safe. No data change.
alter function public.legal_reseal_cols(text) set search_path = '';
