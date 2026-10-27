-- 000222: encrypt the last three plaintext columns (additive; old app code keeps working until the deploy).
--   1. media_receipts.search_text (generated plaintext) -> search_bidx (keyed-HMAC tokens written by the app);
--      the column itself is dropped in 000224 after the new code is live and search parity is verified.
--   2. iam_grants.reason -> sealed by the app write path (enc:v2, system key 'audit'); the SQL audit trigger copies the
--      sealed value; a one-time reason-only reseal is allowed and audited as 'grant_reseal'.
--   3. iam_audit_log.detail/target -> app rows sealed before insert (the chain hashes the stored ciphertext); SQL
--      trigger rows carry references only (iam_audit_row_ok). Historical plaintext rows are resealed ONCE through
--      iam_audit_reseal_apply: an 'audit_epoch' checkpoint row is appended first (old head seq/hash + digest of the
--      resealed rows' seq|hash), the rows keep hash/prev_hash and are marked hash_input='plain_v1' (their hash covers
--      the plaintext, re-verifiable by decrypting: iam_audit_hash_check). No history is rewritten silently, nothing
--      is deleted, retention (24 months) is unchanged.

-- 1 ---------------------------------------------------------------------------------------------------------------
alter table public.media_receipts add column if not exists search_bidx text[];
create index if not exists media_receipts_search_bidx on public.media_receipts using gin (search_bidx);

-- exact pg_trgm word_similarity over values the app passes in (decrypted search text); no table access
create or replace function public.legal_word_similarity(p_q text, p_texts text[]) returns real[]
language sql immutable parallel safe set search_path = public, extensions as $$
  select coalesce(array_agg(word_similarity(p_q, coalesce(t, '')) order by o), '{}')
  from unnest(p_texts) with ordinality as u(t, o)
$$;
revoke all on function public.legal_word_similarity(text, text[]) from public, anon, authenticated;
grant execute on function public.legal_word_similarity(text, text[]) to service_role;

-- 2 ---------------------------------------------------------------------------------------------------------------
alter table public.iam_grants drop constraint if exists iam_grants_reason_check;
-- plaintext length (<= 300) is enforced by the app before sealing; this bounds the ciphertext
alter table public.iam_grants add constraint iam_grants_reason_check check (char_length(reason) <= 1200);

create or replace function public.iam_grants_guard() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.iam_roles; bootstrap boolean := coalesce(current_setting('iam.bootstrap', true), '') = 'on'; actor uuid;
begin
  if tg_op = 'DELETE' then
    raise exception 'iam_grants rows are never deleted; revoke instead';
  end if;
  if tg_op = 'UPDATE' then
    -- one-way reseal of a plaintext reason (000222): only the reason changes, to enc:v2, nothing else
    if new.reason is distinct from old.reason
       and coalesce(old.reason, '') !~ '^enc:v[12]:' and coalesce(new.reason, '') ~ '^enc:v2:'
       and (new.id, new.user_id, new.role_id, new.product_id, new.granted_by, new.created_at, new.expires_at, new.revoked_at, new.revoked_by)
           is not distinct from (old.id, old.user_id, old.role_id, old.product_id, old.granted_by, old.created_at, old.expires_at, old.revoked_at, old.revoked_by) then
      return new;
    end if;
    if (new.id, new.user_id, new.role_id, new.product_id, new.granted_by, new.created_at, new.expires_at, coalesce(new.reason,''))
       is distinct from (old.id, old.user_id, old.role_id, old.product_id, old.granted_by, old.created_at, old.expires_at, coalesce(old.reason,'')) then
      raise exception 'iam_grants: only revocation is allowed';
    end if;
    if old.revoked_at is not null then raise exception 'iam_grants: already revoked'; end if;
    if new.revoked_at is null then return new; end if;
    actor := new.revoked_by;
  else
    actor := new.granted_by;
  end if;

  select * into r from public.iam_roles where id = new.role_id;
  if r.id is null then raise exception 'iam: unknown role'; end if;

  if r.product_id is null and new.product_id <> '*' then raise exception 'iam: platform role needs product *'; end if;
  if r.product_id is not null and new.product_id <> r.product_id then raise exception 'iam: role/product mismatch'; end if;

  if r.id = 'platform.founder' then
    if not bootstrap then raise exception 'iam: founder role changes only through a reviewed migration'; end if;
    return new;
  end if;

  if actor is null then raise exception 'iam: actor required'; end if;
  if actor = new.user_id then raise exception 'iam: no self grant/revoke'; end if;

  if tg_op = 'INSERT' and r.max_duration is not null then
    if new.expires_at is null or new.expires_at <= now() or new.expires_at > now() + r.max_duration then
      raise exception 'iam: time-limited role needs expires_at within %', r.max_duration;
    end if;
  end if;

  if r.owner_level then
    if not public.iam_is_founder(actor) then raise exception 'iam: owner-level roles are founder-only'; end if;
  elsif not (public.iam_is_founder(actor) or public.iam_has_permission(actor, new.product_id, 'iam.grant')) then
    raise exception 'iam: actor lacks iam.grant on %', new.product_id;
  elsif not public.iam_is_founder(actor) and exists (
      select 1 from public.iam_role_permissions rp where rp.role_id = r.id
      and (rp.permission = '*' or not public.iam_has_permission(actor, new.product_id, rp.permission))) then
    raise exception 'iam: cannot grant more than you hold';
  end if;
  return new;
end $$;

-- grant / revoke as before; a reason-only reseal is audited without content; any other update is not an event
create or replace function public.iam_grants_audit() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare k text;
begin
  if tg_op = 'INSERT' then k := 'grant';
  elsif old.revoked_at is null and new.revoked_at is not null then k := 'revoke';
  elsif new.reason is distinct from old.reason then
    insert into public.iam_audit_log (kind, actor_id, product_id, target, detail)
    values ('grant_reseal', null, new.product_id, new.user_id::text, jsonb_build_object('grant_id', new.id, 'field', 'reason'));
    return new;
  else return new;
  end if;
  insert into public.iam_audit_log (kind, actor_id, product_id, target, detail)
  values (k, case when k = 'grant' then new.granted_by else new.revoked_by end,
          new.product_id, new.user_id::text,
          -- reason: enc:v2 sealed by the app (AAD iam_grants.reason), copied as is
          jsonb_build_object('grant_id', new.id, 'role', new.role_id, 'expires_at', new.expires_at, 'reason', new.reason,
                             'bootstrap', coalesce(current_setting('iam.bootstrap', true), '') = 'on'));
  return new;
end $$;

-- break-glass founder restore: no free-text reason (the iam_audit_log 'break_glass' row records the event)
create or replace function public.ops_break_glass_reset(owner uuid default null::uuid, lift_manual_blocks boolean default false)
returns table(recovery_code text) language plpgsql security definer set search_path to '' as $function$
declare
  u uuid := owner; n int; d int; s int; k int; b int := 0; restored boolean := false;
  codes text[] := '{}'; raw text; alpha text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; i int; j int;
begin
  select count(distinct g.user_id) into n from public.iam_grants g
   where g.role_id = 'platform.founder' and g.revoked_at is null and (g.expires_at is null or g.expires_at > now());
  if u is null then
    if n <> 1 then raise exception 'break-glass: % active founders; pass the owner uuid', n; end if;
    select g.user_id into u from public.iam_grants g
     where g.role_id = 'platform.founder' and g.revoked_at is null and (g.expires_at is null or g.expires_at > now()) limit 1;
  elsif not exists (select 1 from public.iam_grants g where g.user_id = u and g.role_id = 'platform.founder'
                      and g.revoked_at is null and (g.expires_at is null or g.expires_at > now())) then
    if n > 0 then raise exception 'break-glass: that user is not the founder'; end if;
    if not exists (select 1 from public.profiles where id = u and role = 'admin') then raise exception 'break-glass: not an admin'; end if;
    perform set_config('iam.bootstrap', 'on', true);
    insert into public.iam_grants (user_id, role_id, product_id, granted_by, reason)
      values (u, 'platform.founder', '*', null, null);
    perform set_config('iam.bootstrap', 'off', true);
    restored := true;
  end if;
  if not exists (select 1 from auth.users where id = u) then raise exception 'break-glass: no such user'; end if;

  update public.ops_trusted_devices set revoked_at = now() where user_id = u and revoked_at is null;
  get diagnostics d = row_count;
  update public.ops_login_requests set status = 'expired' where user_id = u and status in ('pending', 'approved');
  delete from public.ops_handoff_tokens where user_id = u;
  delete from public.ops_security_state where user_id = u;
  insert into public.ops_security_state (user_id, password_rotation_required) values (u, true);
  update public.ops_security_keys set revoked_at = now() where user_id = u and revoked_at is null;
  get diagnostics k = row_count;
  delete from auth.sessions where user_id = u;
  get diagnostics s = row_count;
  update auth.users set banned_until = null where id = u and banned_until is not null;
  update public.ops_lockdown set active = false, allow_ip_hash = null, allowlist_until = null, ended_at = now(), ended_via = 'break_glass'
   where id = 1 and active;
  delete from public.ip_blocks where not manual;
  get diagnostics b = row_count;
  if lift_manual_blocks then
    delete from public.ip_blocks;
    delete from public.ip_block_ranges;
  end if;

  for i in 1..10 loop
    raw := '';
    for j in 1..10 loop
      raw := raw || substr(alpha, 1 + (get_byte(extensions.gen_random_bytes(1), 0) % 32), 1);
    end loop;
    codes := codes || (substr(raw, 1, 5) || '-' || substr(raw, 6, 5));
  end loop;
  perform public.ops_set_recovery_codes(u, codes);

  insert into public.admin_audit_log (actor_id, method, path, detail)
    values (null, 'BREAK_GLASS', 'ops_break_glass_reset', jsonb_build_object('user', u, 'devices', d, 'sessions', s, 'keys', k,
      'ip_blocks', b, 'manual_blocks_lifted', lift_manual_blocks, 'founder_restored', restored, 'db_user', current_user));
  insert into public.iam_audit_log (kind, actor_id, product_id, target, detail)
    values ('break_glass', null, '*', u::text, jsonb_build_object('devices', d, 'sessions', s, 'keys', k, 'founder_restored', restored));
  insert into public.ops_security_events (kind, detail)
    values ('break_glass', jsonb_build_object('user', u, 'devices', d, 'sessions', s, 'keys', k));
  return query select unnest(codes);
end $function$;

-- 3 ---------------------------------------------------------------------------------------------------------------
alter table public.iam_audit_log add column if not exists hash_input text not null default 'stored';
alter table public.iam_audit_log drop constraint if exists iam_audit_log_hash_input_check;
alter table public.iam_audit_log add constraint iam_audit_log_hash_input_check check (hash_input in ('stored', 'plain_v1'));
-- ciphertext is longer than the plaintext bounds (app keeps target <= 200 chars before sealing)
alter table public.iam_audit_log drop constraint if exists iam_audit_log_target_check;
alter table public.iam_audit_log add constraint iam_audit_log_target_check check (char_length(target) <= 800);
alter table public.iam_audit_log drop constraint if exists iam_audit_log_detail_check;
alter table public.iam_audit_log add constraint iam_audit_log_detail_check check (pg_column_size(detail) <= 8000);

-- A row is acceptable without content encryption only when a SQL trigger wrote it with references (ids, role and
-- module codes, counts, flags, an enc:v2 reason). Everything else (app-written kinds) must be sealed.
create or replace function public.iam_audit_row_ok(r public.iam_audit_log) returns boolean
language sql immutable set search_path = '' as $$
  select case
    when (r.target is null or r.target ~ '^enc:v2:') and (r.detail is null or (jsonb_typeof(r.detail) = 'string' and (r.detail #>> '{}') ~ '^enc:v2:'))
      then true
    when r.kind in ('grant', 'revoke', 'grant_reseal', 'module', 'break_glass', 'audit_epoch')
      then (r.target is null or r.target ~ '^[A-Za-z0-9*._:-]{1,64}$')
       and jsonb_typeof(r.detail) = 'object'
       and not exists (
         select 1 from jsonb_each(r.detail) e
         where e.key not in ('grant_id', 'role', 'expires_at', 'reason', 'bootstrap', 'field', 'enabled',
                             'devices', 'sessions', 'keys', 'founder_restored', 'action', 'rows', 'head_seq', 'head_hash', 'seq_hash')
            or (e.key = 'reason' and jsonb_typeof(e.value) <> 'null' and not (jsonb_typeof(e.value) = 'string' and (e.value #>> '{}') ~ '^enc:v2:'))
            or (e.key <> 'reason' and jsonb_typeof(e.value) not in ('null', 'number', 'boolean', 'string'))
            or (e.key <> 'reason' and jsonb_typeof(e.value) = 'string' and (e.value #>> '{}') !~ '^[A-Za-z0-9*._:+ -]{0,128}$'))
    else false end
$$;
revoke all on function public.iam_audit_row_ok(public.iam_audit_log) from public, anon, authenticated;
grant execute on function public.iam_audit_row_ok(public.iam_audit_log) to service_role;

create or replace function public.iam_audit_reject_plaintext() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not coalesce((select e.active from public.field_enc_enforcement e where e.table_name = 'iam_audit_log'), false) then
    return new;
  end if;
  if not public.iam_audit_row_ok(new) then
    raise exception 'enc_reject_plaintext: plaintext write to encrypted column iam_audit_log.detail/target rejected'
      using errcode = '22023', hint = 'write through the field-encryption wrapper (lib/security/field-fetch.ts)';
  end if;
  return new;
end $$;
revoke all on function public.iam_audit_reject_plaintext() from public, anon, authenticated;
drop trigger if exists zz_enc_reject_plaintext on public.iam_audit_log;
create trigger zz_enc_reject_plaintext before insert on public.iam_audit_log
  for each row execute function public.iam_audit_reject_plaintext();
insert into public.field_enc_enforcement (table_name) values ('iam_audit_log') on conflict (table_name) do nothing;

-- Still append-only. The single exception is the documented reseal: only inside iam_audit_reseal_apply (GUC set
-- locally), only target/detail/hash_input change, 'stored' -> 'plain_v1', hash and links untouched.
create or replace function public.iam_audit_immutable() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' and coalesce(current_setting('iam.reseal', true), '') = 'on'
     and old.hash_input = 'stored' and new.hash_input = 'plain_v1'
     and (new.seq, new.at, new.kind, new.actor_id, new.product_id, new.prev_hash, new.hash)
         is not distinct from (old.seq, old.at, old.kind, old.actor_id, old.product_id, old.prev_hash, old.hash) then
    return new;
  end if;
  raise exception 'iam_audit_log is append-only';
end $$;

-- hash of one row from given target/detail (the chain formula of iam_audit_chain)
create or replace function public.iam_audit_row_hash(p_prev text, p_seq bigint, p_at timestamptz, p_kind text, p_actor uuid,
  p_product text, p_target text, p_detail jsonb) returns text
language sql immutable set search_path = public, extensions, pg_temp as $$
  select encode(extensions.digest(coalesce(p_prev, '') || '|' || p_seq::text || '|' || ((extract(epoch from p_at) * 1000000)::bigint)::text || '|' || p_kind || '|' ||
    coalesce(p_actor::text, '') || '|' || coalesce(p_product, '') || '|' || coalesce(p_target, '') || '|' || p_detail::text, 'sha256'), 'hex')
$$;
revoke all on function public.iam_audit_row_hash(text, bigint, timestamptz, text, uuid, text, text, jsonb) from public, anon, authenticated;

-- links for every row; recomputed hash for rows whose hash covers the stored values. plain_v1 rows are checked by
-- the app (decrypt -> iam_audit_hash_check). Returns the first bad seq or NULL.
create or replace function public.iam_audit_verify() returns bigint
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select min(seq) from (
    select seq, hash, prev_hash, at, kind, actor_id, product_id, target, detail, hash_input,
           lag(hash) over (order by seq) as expected_prev
    from public.iam_audit_log
  ) t
  where coalesce(prev_hash, '') <> coalesce(expected_prev, '')
     or (hash_input = 'stored' and hash <> public.iam_audit_row_hash(prev_hash, seq, at, kind, actor_id, product_id, target, detail));
$$;

-- p: [{seq, target, detail}] decrypted values of plain_v1 rows -> number of rows whose hash does not match
-- (a missing seq or a row that is not plain_v1 counts as a mismatch)
create or replace function public.iam_audit_hash_check(p jsonb) returns integer
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select count(*)::int from jsonb_array_elements(p) e
  left join public.iam_audit_log l on l.seq = (e->>'seq')::bigint and l.hash_input = 'plain_v1'
  where l.seq is null
     or l.hash <> public.iam_audit_row_hash(l.prev_hash, l.seq, l.at, l.kind, l.actor_id, l.product_id, e->>'target', e->'detail')
$$;
revoke all on function public.iam_audit_hash_check(jsonb) from public, anon, authenticated;
grant execute on function public.iam_audit_hash_check(jsonb) to service_role;

-- One-time reseal. p: [{seq, plain_target, plain_detail, enc_target, enc_detail}] for rows that fail
-- iam_audit_row_ok. All-or-nothing: the chain must verify, every stored value must equal the given plaintext, the
-- plaintext hash must match, the new values must be enc:v2. Appends the checkpoint first. Returns rows resealed.
create or replace function public.iam_audit_reseal_apply(p jsonb) returns integer
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  e jsonb; l public.iam_audit_log; n int := 0; head public.iam_audit_log; digest_in text := '';
begin
  if public.iam_audit_verify() is not null then raise exception 'iam_audit_reseal: chain does not verify'; end if;
  if jsonb_typeof(p) <> 'array' or jsonb_array_length(p) = 0 then raise exception 'iam_audit_reseal: nothing to do'; end if;
  perform pg_advisory_xact_lock(hashtext('iam_audit_log'));
  for e in select x from jsonb_array_elements(p) x order by (x->>'seq')::bigint loop
    select * into l from public.iam_audit_log where seq = (e->>'seq')::bigint for update;
    if l.seq is null or l.hash_input <> 'stored' then raise exception 'iam_audit_reseal: row % missing or already resealed', e->>'seq'; end if;
    if public.iam_audit_row_ok(l) then raise exception 'iam_audit_reseal: row % needs no reseal', l.seq; end if;
    if l.target is distinct from (e->>'plain_target') or l.detail is distinct from (e->'plain_detail') then
      raise exception 'iam_audit_reseal: row % plaintext mismatch', l.seq;
    end if;
    if l.hash <> public.iam_audit_row_hash(l.prev_hash, l.seq, l.at, l.kind, l.actor_id, l.product_id, e->>'plain_target', e->'plain_detail') then
      raise exception 'iam_audit_reseal: row % hash mismatch', l.seq;
    end if;
    if not ((e->>'enc_target') is null and l.target is null or coalesce(e->>'enc_target', '') ~ '^enc:v2:')
       or jsonb_typeof(e->'enc_detail') <> 'string' or (e->>'enc_detail') !~ '^enc:v2:' then
      raise exception 'iam_audit_reseal: row % new values not sealed', l.seq;
    end if;
    digest_in := digest_in || l.seq::text || ':' || l.hash || ';';
    n := n + 1;
  end loop;
  select * into head from public.iam_audit_log order by seq desc limit 1;
  -- checkpoint (chained like any row): which rows, the head they were resealed under, digest of their seq:hash list
  insert into public.iam_audit_log (kind, actor_id, product_id, target, detail)
  values ('audit_epoch', null, null, null, jsonb_build_object('action', 'reseal_v1', 'rows', n, 'head_seq', head.seq,
          'head_hash', head.hash, 'seq_hash', encode(extensions.digest(digest_in, 'sha256'), 'hex')));
  perform set_config('iam.reseal', 'on', true);
  for e in select x from jsonb_array_elements(p) x loop
    update public.iam_audit_log set target = e->>'enc_target', detail = e->'enc_detail', hash_input = 'plain_v1'
     where seq = (e->>'seq')::bigint;
  end loop;
  perform set_config('iam.reseal', 'off', true);
  if public.iam_audit_verify() is not null then raise exception 'iam_audit_reseal: chain does not verify after reseal'; end if;
  return n;
end $$;
revoke all on function public.iam_audit_reseal_apply(jsonb) from public, anon, authenticated;
grant execute on function public.iam_audit_reseal_apply(jsonb) to service_role;

-- rows that still need the one-time reseal (fail iam_audit_row_ok, hash covers stored values)
create or replace function public.iam_audit_unsealed() returns setof bigint
language sql stable security definer set search_path = public, pg_temp as $$
  select l.seq from public.iam_audit_log l where l.hash_input = 'stored' and not public.iam_audit_row_ok(l) order by l.seq
$$;
revoke all on function public.iam_audit_unsealed() from public, anon, authenticated;
grant execute on function public.iam_audit_unsealed() to service_role;
