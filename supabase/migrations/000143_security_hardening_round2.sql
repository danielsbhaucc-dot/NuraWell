-- Round-2: move vector out of public; revoke RPC on trigger/internal SECURITY DEFINER funcs.

create schema if not exists extensions;
grant usage on schema extensions to postgres, anon, authenticated, service_role;

-- Move pgvector (unused by app — embeddings live in Upstash) out of public.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'vector') then
    execute 'alter extension vector set schema extensions';
  end if;
end $$;

-- Trigger helpers & restore triggers: must not be callable via PostgREST RPC.
revoke all on function public.almog_assignment_sync_uta_trg() from public, anon, authenticated;
revoke all on function public.trg_restore_pii_ai_interactions() from public, anon, authenticated;
revoke all on function public.trg_restore_pii_chat_sessions() from public, anon, authenticated;
revoke all on function public.trg_restore_pii_generic() from public, anon, authenticated;
revoke all on function public.trg_restore_pii_notifications() from public, anon, authenticated;
revoke all on function public.trg_restore_pii_periodic_summaries() from public, anon, authenticated;
revoke all on function public.rls_auto_enable() from public, anon, authenticated;

-- is_admin / nura_is_admin: keep for authenticated RLS helpers; revoke anon.
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;
revoke all on function public.nura_is_admin(uuid) from public, anon;
grant execute on function public.nura_is_admin(uuid) to authenticated, service_role;
revoke all on function public.demo_access_blocks_admin(uuid) from public, anon;
grant execute on function public.demo_access_blocks_admin(uuid) to authenticated, service_role;
revoke all on function public.admin_has_passkey() from public, anon;
grant execute on function public.admin_has_passkey() to authenticated, service_role;

-- challenge_public_stats intentionally public (marketing counters) — leave as-is.
