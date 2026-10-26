-- 000201 proof. Entire run is ROLLED BACK; disposable rows only.
begin;
do $$
declare u uuid := gen_random_uuid(); d1 uuid; d2 uuid; s1 uuid := gen_random_uuid(); s2 uuid := gen_random_uuid(); n int;
begin
  insert into auth.users(id) values (u);
  insert into public.ops_trusted_devices(user_id, secret_hash) values (u, 'x') returning id into d1;
  insert into public.ops_trusted_devices(user_id, secret_hash) values (u, 'y') returning id into d2;
  insert into auth.sessions(id, user_id) values (s1, u), (s2, u);
  if not public.ops_bind_admin_session(u, s1, d1) then raise exception 'bind failed'; end if;
  if not public.ops_bind_admin_session(u, s1, d1) then raise exception 'rebind same device failed'; end if;
  if public.ops_bind_admin_session(u, s1, d2) then raise exception 'session moved to another device'; end if;
  if public.ops_bind_admin_session(gen_random_uuid(), s1, d1) then raise exception 'other user accepted'; end if;
  perform public.ops_bind_admin_session(u, s2, d2);
  n := public.ops_revoke_device_sessions(d1);
  if n <> 1 then raise exception 'device revoke count %', n; end if;
  if public.ops_bind_admin_session(u, s1, d1) then raise exception 'revoked session accepted'; end if;
  if not public.ops_bind_admin_session(u, s2, d2) then raise exception 'other device killed'; end if;
  if not exists (select 1 from auth.sessions where id = s2) then raise exception 'other auth session deleted'; end if;
  perform public.ops_revoke_all_admin_sessions(u);
  if public.ops_bind_admin_session(u, s2, d2) then raise exception 'revoke all missed'; end if;
  raise notice 'admin_sessions ok';
end $$;
rollback;
