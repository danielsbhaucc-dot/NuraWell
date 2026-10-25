-- Break-glass v2 proof. Runs entirely inside a transaction that is ROLLED BACK; uses disposable users only.
-- psql -v ON_ERROR_STOP=1 -f supabase/tests/break_glass.test.sql   (local/disposable DB — never prod)
begin;
do $$
declare f uuid := gen_random_uuid(); a2 uuid := gen_random_uuid(); c text[]; n int; ok boolean;
begin
  -- disposable founder + a SECOND admin (the old function broke as soon as there were 2 admins)
  insert into auth.users(id) values (f), (a2);
  insert into public.profiles(id, role) values (f, 'admin'), (a2, 'admin');
  perform set_config('iam.bootstrap', 'on', true);
  update public.iam_grants set revoked_at = now() where role_id = 'platform.founder' and revoked_at is null;
  insert into public.iam_grants(user_id, role_id, product_id, reason) values (f, 'platform.founder', '*', 'test');
  perform set_config('iam.bootstrap', 'off', true);
  -- simulate an incident against the founder
  insert into auth.sessions(user_id) values (f), (f), (a2);
  update auth.users set banned_until = 'infinity' where id = f;
  insert into public.ops_trusted_devices(user_id) values (f);
  insert into public.ops_login_requests(user_id, status) values (f, 'pending');
  insert into public.ops_security_state(user_id, recovery_locked_until) values (f, now() + interval '1h');
  insert into public.ops_security_keys(user_id) values (f);
  update public.ops_lockdown set active = true, allow_ip_hash = 'x' where id = 1;
  insert into public.ip_blocks values ('auto', false, now() + interval '30 min'), ('manual', true, 'infinity');

  select array_agg(recovery_code) into c from public.ops_break_glass_reset();   -- no uuid: resolved from IAM
  if array_length(c, 1) <> 10 then raise exception 'FAIL codes %', array_length(c, 1); end if;
  if (select count(*) from auth.sessions where user_id = f) <> 0 then raise exception 'FAIL sessions'; end if;
  if (select count(*) from auth.sessions where user_id = a2) <> 1 then raise exception 'FAIL touched other admin'; end if;
  if (select banned_until from auth.users where id = f) is not null then raise exception 'FAIL ban'; end if;
  if exists (select 1 from public.ops_trusted_devices where user_id = f and revoked_at is null) then raise exception 'FAIL devices'; end if;
  if exists (select 1 from public.ops_login_requests where user_id = f and status = 'pending') then raise exception 'FAIL requests'; end if;
  if exists (select 1 from public.ops_security_state where user_id = f and (recovery_locked_until is not null)) then raise exception 'FAIL recovery lockout'; end if;
  if not exists (select 1 from public.ops_security_state where user_id = f and password_rotation_required) then raise exception 'FAIL rotation flag not set'; end if;
  if exists (select 1 from public.ops_security_keys where user_id = f and revoked_at is null) then raise exception 'FAIL keys'; end if;
  if (select active from public.ops_lockdown where id = 1) then raise exception 'FAIL lockdown'; end if;
  if exists (select 1 from public.ip_blocks where ip_hash = 'auto') then raise exception 'FAIL auto block'; end if;
  if not exists (select 1 from public.ip_blocks where ip_hash = 'manual') then raise exception 'FAIL manual block lifted by default'; end if;
  -- the issued codes are what the Ops login redeems (ops_use_recovery_code), one-time, case/dash-insensitive
  if not public.ops_use_recovery_code(f, lower(c[1])) then raise exception 'FAIL code 1 rejected'; end if;
  if public.ops_use_recovery_code(f, c[1]) then raise exception 'FAIL code reuse accepted'; end if;
  if not public.ops_use_recovery_code(f, replace(c[2], '-', '')) then raise exception 'FAIL code 2 rejected'; end if;
  if public.ops_use_recovery_code(a2, c[3]) then raise exception 'FAIL code works for other user'; end if;
  -- audit + alert trail
  if not exists (select 1 from public.admin_audit_log where method = 'BREAK_GLASS' and detail->>'user' = f::text) then raise exception 'FAIL admin audit'; end if;
  if not exists (select 1 from public.ops_security_events where kind = 'break_glass' and detail->>'user' = f::text) then raise exception 'FAIL alert event'; end if;
  if not exists (select 1 from public.iam_audit_log where kind = 'break_glass' and target = f::text) then raise exception 'FAIL iam audit'; end if;
  if public.iam_audit_verify() is not null then raise exception 'FAIL audit chain'; end if;
  -- a non-founder uuid is refused
  begin perform public.ops_break_glass_reset(a2); raise exception 'FAIL non-founder accepted';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  -- with manual flag, manual blocks go too
  perform public.ops_break_glass_reset(null, true);
  if exists (select 1 from public.ip_blocks) then raise exception 'FAIL manual lift'; end if;
  -- founder grant lost → explicit uuid restores it (and only for a profile admin)
  perform set_config('iam.bootstrap', 'on', true);
  update public.iam_grants set revoked_at = now() where role_id = 'platform.founder' and revoked_at is null;
  perform set_config('iam.bootstrap', 'off', true);
  begin perform public.ops_break_glass_reset(); raise exception 'FAIL no-founder accepted';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  perform public.ops_break_glass_reset(f);
  if not public.iam_is_founder(f) then raise exception 'FAIL founder not restored'; end if;
  raise notice 'BREAK-GLASS TEST: ALL PASSED';
end $$;
rollback;
