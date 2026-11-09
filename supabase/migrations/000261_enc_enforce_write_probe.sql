-- 000261: rolled-back write probe for per-table enforcement activation (field_enc_enforcement).
-- The app's real write path (sealing client) builds the row; the sealed body is replayed here with enforcement
-- switched on, then everything (row + flag) is rolled back. A second replay with one registered column in plaintext
-- must be rejected by zz_enc_reject_plaintext. Returns outcome strings only (the trigger message names table+column).
-- Nothing is persisted: each attempt ends in raise 'probe-rollback' inside its own subtransaction.
create or replace function public.enc_enforce_write_probe(p_table text, p_row jsonb, p_plain jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare was boolean; cols text; res text[] := array[]::text[]; p jsonb; r text; i int;
begin
  select active into was from public.field_enc_enforcement where table_name = p_table;
  if not found or to_regclass(format('public.%I', p_table)) is null then
    raise exception 'enc_enforce_write_probe: table not registered';
  end if;
  for i in 1..2 loop
    p := case when i = 1 then p_row else p_plain end;
    begin
      update public.field_enc_enforcement set active = true where table_name = p_table and not active;
      select string_agg(format('%I', key), ', ') into cols from jsonb_object_keys(p) key;
      execute format('insert into public.%2$I (%1$s) select %1$s from jsonb_populate_record(null::public.%2$I, $1)', cols, p_table) using p;
      raise exception 'probe-rollback' using errcode = 'P0099';
    exception when sqlstate 'P0099' then r := 'accepted';
              when others then r := 'rejected: ' || sqlerrm;
    end;
    res := res || r;
  end loop;
  return jsonb_build_object('was_active', was, 'sealed', res[1], 'plain', res[2],
    'active_after', (select active from public.field_enc_enforcement where table_name = p_table));
end $$;

revoke all on function public.enc_enforce_write_probe(text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.enc_enforce_write_probe(text, jsonb, jsonb) to service_role;
