-- Data minimization: automatic retention for operational / temporary personal data.
-- User content (chats, memories, progress) is kept until account deletion.
-- p_include_user_content=true additionally purges processed duplicate chat copies
-- and old read notifications (enable only after owner approval).
create or replace function public.purge_expired_personal_data(p_include_user_content boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare r jsonb := '{}'::jsonb; n int;
begin
  -- security / auth artifacts
  delete from webauthn_challenges where expires_at < now() - interval '1 day'; get diagnostics n = row_count; r := r || jsonb_build_object('webauthn_challenges', n);
  delete from ops_handoff_tokens where expires_at < now() - interval '1 day'; get diagnostics n = row_count; r := r || jsonb_build_object('ops_handoff_tokens', n);
  delete from ops_login_requests where created_at < now() - interval '30 days'; get diagnostics n = row_count; r := r || jsonb_build_object('ops_login_requests', n);
  delete from demo_access_sessions where expires_at < now() - interval '30 days'; get diagnostics n = row_count; r := r || jsonb_build_object('demo_access_sessions', n);
  -- IP addresses: keep 30 days, then strip; audit rows kept 1 year
  update admin_audit_log set ip = null where ip is not null and created_at < now() - interval '30 days'; get diagnostics n = row_count; r := r || jsonb_build_object('admin_audit_ip_stripped', n);
  delete from admin_audit_log where created_at < now() - interval '365 days'; get diagnostics n = row_count; r := r || jsonb_build_object('admin_audit_log', n);
  delete from ops_security_events where created_at < now() - interval '365 days'; get diagnostics n = row_count; r := r || jsonb_build_object('ops_security_events', n);
  -- diagnostics
  delete from error_events where created_at < now() - interval '30 days'; get diagnostics n = row_count; r := r || jsonb_build_object('error_events', n);
  delete from chat_perf_timings where created_at < now() - interval '90 days'; get diagnostics n = row_count; r := r || jsonb_build_object('chat_perf_timings', n);
  delete from gideon_outbox where status <> 'pending' and created_at < now() - interval '30 days'; get diagnostics n = row_count; r := r || jsonb_build_object('gideon_outbox', n);
  delete from pending_almog_commitment_jobs where processed and created_at < now() - interval '7 days'; get diagnostics n = row_count; r := r || jsonb_build_object('pending_almog_commitment_jobs', n);
  if p_include_user_content then
    delete from pending_chat_logs where processed and created_at < now() - interval '7 days'; get diagnostics n = row_count; r := r || jsonb_build_object('pending_chat_logs', n);
    delete from notifications where is_read and created_at < now() - interval '180 days'; get diagnostics n = row_count; r := r || jsonb_build_object('notifications', n);
  end if;
  return r;
end $$;

revoke all on function public.purge_expired_personal_data(boolean) from public, anon, authenticated;
grant execute on function public.purge_expired_personal_data(boolean) to service_role;
