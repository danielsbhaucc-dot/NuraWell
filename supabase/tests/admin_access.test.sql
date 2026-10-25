-- Admin access hardening proof (000198-000200). Entire run is ROLLED BACK; disposable rows only.
begin;
do $$
declare u uuid := gen_random_uuid(); d uuid; e uuid; c int; ok boolean := false; r record;
begin
  insert into auth.users(id) values (u);
  -- enrollment: single use, expiry enforced
  insert into public.ops_device_enrollments(user_id, token_hash, expires_at) values (u, 'h_ok', now() + interval '10 min'), (u, 'h_old', now() - interval '1 min');
  select count(*) into c from public.ops_claim_enrollment('h_ok'); if c <> 1 then raise exception 'claim failed'; end if;
  select count(*) into c from public.ops_claim_enrollment('h_ok'); if c <> 0 then raise exception 'replay accepted'; end if;
  select count(*) into c from public.ops_claim_enrollment('h_old'); if c <> 0 then raise exception 'expired accepted'; end if;
  -- number matching: not before factor, wrong = revoke, replay = used, other request unaffected, expiry
  insert into public.ops_device_enrollments(user_id, token_hash, expires_at, factor_ok_at, match_number, match_expires_at) values
    (u, 'm1', now() + interval '10 min', now(), 42, now() + interval '2 min') returning id into e;
  insert into public.ops_device_enrollments(user_id, token_hash, expires_at, factor_ok_at, match_number, match_expires_at) values
    (u, 'm2', now() + interval '10 min', now(), 17, now() + interval '2 min') returning id into d;
  if public.ops_enroll_decide(d, 42) <> 'wrong' then raise exception 'number of other request accepted'; end if;
  if public.ops_enroll_decide(d, 17) <> 'used' then raise exception 'retry after wrong accepted'; end if;
  if public.ops_enroll_decide(e, 42) <> 'approved' then raise exception 'right number rejected'; end if;
  if public.ops_enroll_decide(e, 42) <> 'used' then raise exception 'approval replay accepted'; end if;
  insert into public.ops_device_enrollments(user_id, token_hash, expires_at, match_number, match_expires_at) values (u, 'm3', now() + interval '10 min', 55, now() + interval '2 min') returning id into d;
  if public.ops_enroll_decide(d, 55) <> 'not_ready' then raise exception 'approved without second factor'; end if;
  insert into public.ops_device_enrollments(user_id, token_hash, expires_at, factor_ok_at, match_number, match_expires_at) values (u, 'm4', now() + interval '10 min', now(), 55, now() - interval '1 s') returning id into d;
  if public.ops_enroll_decide(d, 55) <> 'expired' then raise exception 'expired approval accepted'; end if;
  -- probe counter aggregates
  perform public.ops_probe_hit('iphash_test', 'IL'); perform public.ops_probe_hit('iphash_test', 'IL');
  select hits into c from public.ops_probe_daily where ip_hash = 'iphash_test'; if c <> 2 then raise exception 'probe agg'; end if;
  -- grants: reason length + max ttl enforced by DB
  begin insert into public.pii_access_grants(actor_id, subject_id, reason, expires_at) values (u, u, 'short', now() + interval '5 min'); raise exception 'short reason accepted';
  exception when check_violation then null; end;
  begin insert into public.pii_access_grants(actor_id, subject_id, reason, expires_at) values (u, u, 'support ticket about export', now() + interval '3 hours'); raise exception 'long ttl accepted';
  exception when check_violation then null; end;
  insert into public.pii_access_grants(actor_id, subject_id, reason, expires_at) values (u, u, 'support ticket about export', now() + interval '30 min');
  -- append-only log
  insert into public.pii_access_log(actor_id, subject_id, event) values (u, u, 'view');
  begin update public.pii_access_log set event = 'grant' where actor_id = u; raise exception 'log updatable';
  exception when raise_exception then if sqlerrm not like '%append-only%' then raise; end if; end;
  begin delete from public.pii_access_log where actor_id = u; raise exception 'log deletable';
  exception when raise_exception then if sqlerrm not like '%append-only%' then raise; end if; end;
  -- RLS: no anon/authenticated access
  if has_table_privilege('authenticated', 'public.pii_access_log', 'select') or has_table_privilege('anon', 'public.ops_device_enrollments', 'select') then raise exception 'client access'; end if;
  insert into public.access_audit_runs(window_from, window_to) values (now() - interval '1 day', now()) returning id into e;
  insert into public.access_audit_findings(run_id, severity, summary, event_kind) values (e, 'low', 'x', 'probe');
  raise notice 'admin_access tests passed';
end $$;
rollback;
