-- 000225: one-time, documented reseal of the legacy plaintext cells in the append-only legal tables
-- (consent_evidence, consent_evidence_attestations, legal_access_log) + rolled-back media_receipts write probe.
--
-- Integrity model (nothing evidentiary changes):
--  * consent_evidence.record_hash / prev_hash / signature cover payload_json *plaintext* (recordHash(payload_json)).
--    They are not touched; after the reseal the chain is re-verified on decrypted values (verifyChain).
--  * Before a cell is resealed, the sha256 of its exact original value is appended to legal_reseal_checkpoint
--    (append-only, hashes only, no content), and one batch row records a digest over all items + the consent
--    chain head. legal_reseal_check() re-hashes decrypted values against those originals at any later time.
--  * The append-only triggers still reject every UPDATE/DELETE/TRUNCATE, except inside legal_reseal_apply()
--    (GUC legal.reseal set locally): exactly one registered column changes, plaintext -> enc:v2, all else equal.

create table if not exists public.legal_reseal_checkpoint (
  id bigserial primary key,
  batch uuid not null,
  table_name text not null,
  row_id text not null,          -- '*' = batch summary row
  col text not null,
  plain_sha256 text not null,    -- sha256 of the original value (text as-is; jsonb as jsonb::text)
  at timestamptz not null default now()
);
alter table public.legal_reseal_checkpoint enable row level security;
revoke all on public.legal_reseal_checkpoint from public, anon, authenticated;
create index if not exists legal_reseal_checkpoint_cell on public.legal_reseal_checkpoint (table_name, row_id, col);
drop trigger if exists legal_reseal_checkpoint_no_mutate on public.legal_reseal_checkpoint;
create trigger legal_reseal_checkpoint_no_mutate before delete or update on public.legal_reseal_checkpoint
  for each row execute function public.trg_consent_evidence_append_only();
drop trigger if exists legal_reseal_checkpoint_no_truncate on public.legal_reseal_checkpoint;
create trigger legal_reseal_checkpoint_no_truncate before truncate on public.legal_reseal_checkpoint
  for each statement execute function public.trg_consent_evidence_append_only();

-- registered encrypted columns of the three tables (field-registry.ts)
create or replace function public.legal_reseal_cols(p_table text) returns text[]
language sql immutable as $$
  select case p_table
    when 'consent_evidence' then array['payload_json','rendered_html','screenshot_segments','typed_word','user_agent']
    when 'consent_evidence_attestations' then array['payload']
    when 'legal_access_log' then array['detail']
  end
$$;

-- canonical hash input of one stored value: text as-is, jsonb as its normalized text
create or replace function public.legal_value_sha256(v jsonb) returns text
language sql immutable set search_path = public, extensions, pg_temp as $$
  select case when v is null or v = 'null'::jsonb then 'null'
    when jsonb_typeof(v) = 'string' then encode(extensions.digest(v #>> '{}', 'sha256'), 'hex')
    else encode(extensions.digest(v::text, 'sha256'), 'hex') end
$$;

create or replace function public.legal_append_only_guard() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare c text; nj jsonb; oj jsonb; changed int := 0;
begin
  if tg_op = 'UPDATE' and coalesce(current_setting('legal.reseal', true), '') = 'on' then
    nj := to_jsonb(new); oj := to_jsonb(old);
    foreach c in array public.legal_reseal_cols(tg_table_name) loop
      if (nj -> c) is distinct from (oj -> c) then
        if coalesce(oj ->> c, '') ~ '^enc:v[12]:' then raise exception 'legal reseal: % already sealed', c; end if;
        if coalesce(nj ->> c, '') !~ '^enc:v2:' then raise exception 'legal reseal: % must become enc:v2', c; end if;
        changed := changed + 1;
      end if;
    end loop;
    if changed = 1 and (nj - public.legal_reseal_cols(tg_table_name)) = (oj - public.legal_reseal_cols(tg_table_name)) then
      return new;
    end if;
  end if;
  raise exception 'consent evidence is append-only' using errcode = '42501';
end $$;

do $$ declare t text; begin
  foreach t in array array['consent_evidence','consent_evidence_attestations','legal_access_log'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_no_mutate', t);
    execute format('create trigger %I before delete or update on public.%I for each row execute function public.legal_append_only_guard()', t || '_no_mutate', t);
  end loop;
end $$;

-- plaintext cells still to reseal
create or replace function public.legal_unsealed() returns table (t text, id text, col text)
language sql stable security definer set search_path = public, pg_temp as $$
  select 'consent_evidence', e.id::text, c from public.consent_evidence e, unnest(public.legal_reseal_cols('consent_evidence')) c
   where (to_jsonb(e) -> c) is not null and (to_jsonb(e) -> c) <> 'null'::jsonb and coalesce(to_jsonb(e) ->> c, '') !~ '^enc:v[12]:'
  union all
  select 'consent_evidence_attestations', a.id::text, 'payload' from public.consent_evidence_attestations a
   where a.payload is not null and a.payload <> 'null'::jsonb and coalesce(a.payload #>> '{}', '') !~ '^enc:v[12]:'
  union all
  select 'legal_access_log', l.id::text, 'detail' from public.legal_access_log l
   where l.detail is not null and l.detail <> 'null'::jsonb and coalesce(l.detail #>> '{}', '') !~ '^enc:v[12]:'
$$;

-- p: [{t, id, col, cipher}] (cipher = enc:v2 string from the app, already verified to decrypt to the original).
-- Records original hashes + a batch row, then updates each cell. Returns the number of cells resealed.
create or replace function public.legal_reseal_apply(p jsonb) returns int
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare it jsonb; b uuid := gen_random_uuid(); cur jsonb; n int := 0; d text := '';
begin
  perform set_config('legal.reseal', 'on', true);
  for it in select * from jsonb_array_elements(p) order by value ->> 't', value ->> 'id', value ->> 'col' loop
    if not (it ->> 'col' = any (public.legal_reseal_cols(it ->> 't'))) then raise exception 'legal reseal: bad column'; end if;
    if coalesce(it ->> 'cipher', '') !~ '^enc:v2:' then raise exception 'legal reseal: bad cipher'; end if;
    execute format('select to_jsonb(x) -> %L from public.%I x where id::text = $1 for update', it ->> 'col', it ->> 't') into cur using it ->> 'id';
    if cur is null or cur = 'null'::jsonb or coalesce(cur #>> '{}', '') ~ '^enc:v[12]:' then continue; end if;
    insert into public.legal_reseal_checkpoint (batch, table_name, row_id, col, plain_sha256)
      values (b, it ->> 't', it ->> 'id', it ->> 'col', public.legal_value_sha256(cur));
    d := d || (it ->> 't') || '|' || (it ->> 'id') || '|' || (it ->> 'col') || '|' || public.legal_value_sha256(cur) || E'\n';
    if (select data_type from information_schema.columns where table_schema = 'public' and table_name = it ->> 't' and column_name = it ->> 'col') = 'jsonb' then
      execute format('update public.%I set %I = to_jsonb($1::text) where id::text = $2', it ->> 't', it ->> 'col') using it ->> 'cipher', it ->> 'id';
    else
      execute format('update public.%I set %I = $1 where id::text = $2', it ->> 't', it ->> 'col') using it ->> 'cipher', it ->> 'id';
    end if;
    n := n + 1;
  end loop;
  if n > 0 then
    insert into public.legal_reseal_checkpoint (batch, table_name, row_id, col, plain_sha256)
      values (b, '*', '*', 'batch:' || n || ':head=' || coalesce((select record_hash from public.consent_evidence order by created_at desc, id desc limit 1), ''),
              encode(extensions.digest(d, 'sha256'), 'hex'));
  end if;
  perform set_config('legal.reseal', '', true);
  return n;
end $$;

-- p: [{t, id, col, value}] with decrypted values. Returns {checked, mismatch, missing}.
create or replace function public.legal_reseal_check(p jsonb) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  with i as (select value ->> 't' t, value ->> 'id' id, value ->> 'col' col, value -> 'value' v from jsonb_array_elements(p)),
  k as (select i.*, (select c.plain_sha256 from public.legal_reseal_checkpoint c where c.table_name = i.t and c.row_id = i.id and c.col = i.col order by c.id desc limit 1) h from i)
  select jsonb_build_object('checked', count(*) filter (where h is not null), 'missing', count(*) filter (where h is null),
    'mismatch', count(*) filter (where h is not null and h <> public.legal_value_sha256(v))) from k
$$;

-- rolled-back proof that a sealed media_receipts insert + update pass enc_reject_plaintext once enforcement is on.
-- Nothing persists (P0099 rollback of the subtransaction). Returns 'accepted' or the rejection message.
create or replace function public.media_receipts_write_probe(p_row jsonb, p_update jsonb) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare rid uuid; r text; k text; sets text := ''; cols text;
begin
  begin
    update public.field_enc_enforcement set active = true where table_name = 'media_receipts';
    select string_agg(format('%I', key), ', ') into cols from jsonb_object_keys(p_row) key;
    execute format('insert into public.media_receipts (%1$s) select %1$s from jsonb_populate_record(null::public.media_receipts, $1) returning id', cols)
      into rid using p_row;
    for k in select jsonb_object_keys(p_update) loop
      sets := sets || case when sets = '' then '' else ', ' end || format('%I = (jsonb_populate_record(null::public.media_receipts, $1)).%I', k, k);
    end loop;
    if sets <> '' then execute format('update public.media_receipts set %s where id = $2', sets) using p_update, rid; end if;
    raise exception 'probe-rollback' using errcode = 'P0099';
  exception when sqlstate 'P0099' then r := 'accepted';
            when others then r := 'rejected: ' || sqlerrm;
  end;
  return r;
end $$;

do $$ declare f text; begin
  foreach f in array array['legal_unsealed()','legal_reseal_apply(jsonb)','legal_reseal_check(jsonb)','media_receipts_write_probe(jsonb, jsonb)',
                           'legal_value_sha256(jsonb)','legal_reseal_cols(text)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
