-- On-demand DB-side audit trail for ONE consent event, without a Supabase personal access token.
-- Reads auth.audit_log_entries (logins, token refresh, user changes) + own admin_audit_log in a bounded window.
create or replace function public.legal_db_audit_window(p_user uuid, p_start timestamptz, p_end timestamptz)
returns table(source text, ts timestamptz, action text, detail jsonb)
language sql stable security definer set search_path = '' as $$
  (select 'auth.audit_log_entries'::text, a.created_at, coalesce(a.payload->>'action', ''), a.payload::jsonb - 'traits'
     from auth.audit_log_entries a
    where a.created_at between p_start and p_end
      and (a.payload->>'actor_id' = p_user::text or a.payload->'traits'->>'user_id' = p_user::text)
    order by a.created_at limit 200)
  union all
  (select 'public.admin_audit_log'::text, l.created_at, l.method || ' ' || l.path, l.detail
     from public.admin_audit_log l
    where l.created_at between p_start and p_end
      and (l.path like '%' || p_user::text || '%' or l.detail::text like '%' || p_user::text || '%')
    order by l.created_at limit 200)
$$;
revoke all on function public.legal_db_audit_window(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.legal_db_audit_window(uuid, timestamptz, timestamptz) to service_role;
