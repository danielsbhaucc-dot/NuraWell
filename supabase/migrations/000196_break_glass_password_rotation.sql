-- Break-glass hardening: after ops_break_glass_reset() the founder's next Ops session must set a NEW password
-- (proven with one of the fresh recovery codes) before any other Ops access. Enforced in the Ops API gate
-- (requireApiAdmin) and the Ops page gate (ensureOpsAdminServer). The flag lives on ops_security_state.
alter table public.ops_security_state add column if not exists password_rotation_required boolean not null default false;

create or replace function public.ops_break_glass_reset(owner uuid default null, lift_manual_blocks boolean default false)
returns table (recovery_code text) language plpgsql security definer set search_path = '' as $$
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
      values (u, 'platform.founder', '*', null, 'break-glass restore');
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
end $$;
revoke all on function public.ops_break_glass_reset(uuid, boolean) from public, anon, authenticated;
grant execute on function public.ops_break_glass_reset(uuid, boolean) to service_role;
