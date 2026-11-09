-- 000259: one-time, documented reseal of legacy plaintext pii_access_log.country/resource (append-only journal).
-- Same model as 000225 (legal evidence): the original value's sha256 is appended to legal_reseal_checkpoint
-- (append-only, hashes only) before a cell changes, and legal_reseal_check() can re-verify it later.
--  * DELETE and TRUNCATE stay denied, always.
--  * UPDATE stays denied, except inside pii_reseal_apply() (GUC pii.reseal set locally): exactly one of
--    country/resource changes, plaintext -> enc:v2, every other column identical.
--  * pii_reseal_apply / pii_unsealed are service_role only. 000260 removes the apply path after the run.
-- No row is added or removed. Enforcement flag (field_enc_enforcement) is not touched here.

create or replace function public.pii_access_log_guard() returns trigger
language plpgsql set search_path = '' as $$
declare c text; nj jsonb; oj jsonb; changed int := 0;
begin
  if tg_op = 'UPDATE' and coalesce(current_setting('pii.reseal', true), '') = 'on' then
    nj := to_jsonb(new); oj := to_jsonb(old);
    foreach c in array array['country', 'resource'] loop
      if (nj -> c) is distinct from (oj -> c) then
        if coalesce(oj ->> c, '') ~ '^enc:v[12]:' then raise exception 'pii reseal: % already sealed', c; end if;
        if coalesce(nj ->> c, '') !~ '^enc:v2:' then raise exception 'pii reseal: % must become enc:v2', c; end if;
        changed := changed + 1;
      end if;
    end loop;
    if changed = 1 and (nj - array['country', 'resource']) = (oj - array['country', 'resource']) then
      return new;
    end if;
  end if;
  raise exception 'pii_access_log is append-only';
end $$;

drop trigger if exists trg_pii_access_log_immutable on public.pii_access_log;
create trigger trg_pii_access_log_immutable before update or delete on public.pii_access_log
  for each row execute function public.pii_access_log_guard();
-- trg_pii_access_log_no_truncate (statement level, pii_access_log_immutable) is unchanged.

create or replace function public.pii_unsealed() returns table (t text, id text, col text)
language sql stable security definer set search_path = '' as $$
  select 'pii_access_log', l.id::text, c.col
    from public.pii_access_log l
    cross join lateral (values ('country', l.country), ('resource', l.resource)) as c(col, v)
   where c.v is not null and c.v <> '' and c.v !~ '^enc:v[12]:'
$$;

-- p: [{t, id, col, cipher}] (cipher = enc:v2 from the app, already verified to decrypt to the original).
create or replace function public.pii_reseal_apply(p jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare it jsonb; b uuid := gen_random_uuid(); cur text; n int := 0; d text := '';
begin
  perform set_config('pii.reseal', 'on', true);
  for it in select * from jsonb_array_elements(p) order by value ->> 'id', value ->> 'col' loop
    if it ->> 't' <> 'pii_access_log' or not (it ->> 'col' = any (array['country', 'resource'])) then
      raise exception 'pii reseal: bad target';
    end if;
    if coalesce(it ->> 'cipher', '') !~ '^enc:v2:' then raise exception 'pii reseal: bad cipher'; end if;
    execute format('select %I from public.pii_access_log where id::text = $1 for update', it ->> 'col') into cur using it ->> 'id';
    if cur is null or cur = '' or cur ~ '^enc:v[12]:' then continue; end if;
    insert into public.legal_reseal_checkpoint (batch, table_name, row_id, col, plain_sha256)
      values (b, 'pii_access_log', it ->> 'id', it ->> 'col', public.legal_value_sha256(to_jsonb(cur)));
    d := d || 'pii_access_log|' || (it ->> 'id') || '|' || (it ->> 'col') || '|' || public.legal_value_sha256(to_jsonb(cur)) || E'\n';
    execute format('update public.pii_access_log set %I = $1 where id::text = $2', it ->> 'col') using it ->> 'cipher', it ->> 'id';
    n := n + 1;
  end loop;
  if n > 0 then
    insert into public.legal_reseal_checkpoint (batch, table_name, row_id, col, plain_sha256)
      values (b, '*', '*', 'pii_batch:' || n, encode(extensions.digest(d, 'sha256'), 'hex'));
  end if;
  perform set_config('pii.reseal', '', true);
  return n;
end $$;

revoke all on function public.pii_unsealed() from public, anon, authenticated;
revoke all on function public.pii_reseal_apply(jsonb) from public, anon, authenticated;
grant execute on function public.pii_unsealed() to service_role;
grant execute on function public.pii_reseal_apply(jsonb) to service_role;
