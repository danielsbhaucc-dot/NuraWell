-- 000101: root cause for "SECURITY DEFINER callable by anon/authenticated": default privileges in schema public
-- granted EXECUTE on every NEW function to anon + authenticated. Existing functions were already revoked (000090);
-- this stops new ones from being exposed. Client-callable RPCs must now be granted explicitly.
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;
-- keep the three functions RLS / the public challenge page need (unchanged): is_admin(), nura_is_admin(uuid), challenge_public_stats()

-- nura_is_admin(uuid) is only used by policies for authenticated users; anon could probe any uuid → revoke
revoke execute on function public.nura_is_admin(uuid) from public, anon;
grant execute on function public.nura_is_admin(uuid) to authenticated, service_role;
