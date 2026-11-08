-- DESIGN ONLY. Not a Supabase migration. Do not copy this file into supabase/migrations
-- and do not apply it to production as part of the change that added it.
--
-- Why this file exists
-- The httpOnly HMAC cookie pl_parent_session is never sent to Supabase. PostgREST, Realtime
-- postgres_changes, and the user-scoped server client all present the GoTrue access token.
-- Current policies authorize with auth.uid() (and, on some tables, is_admin()). A password
-- session for the same user therefore passes those policies. Postgres cannot check the HMAC:
-- the secret is not in the JWT, and putting it in the database so a client-supplied cookie
-- could be verified would publish the secret to anyone who can read SQL.
--
-- What Postgres can see
-- Installed @supabase/auth-js RequiredClaims includes session_id on the access token.
-- auth.jwt() ->> 'session_id' is that claim. GoTrue keeps the same auth.sessions id across
-- access-token refresh; session_not_found means that id no longer has a sessions row
-- (sign-out, revoke, expiry), not that refresh minted a new id. A custom access-token hook
-- that strips session_id makes parent_session_ok fail closed while the signin column is
-- test or all.
--
-- What Postgres cannot see
-- PLATFORM_SIGNIN_MODE. The app arms parent sign-in only when that env is on AND
-- platform_link_settings.signin is test or all. This function follows the column only.
-- While the column is off, null, or unreadable, the function returns true and existing
-- policies stay as they are. Turning the column to test or all after this SQL is applied,
-- while the env is still off, would deny password sessions in RLS even though the app
-- still shows password login. Apply only together with the env, and only after the
-- callback is writing grants.
--
-- Grants
-- Service role inserts one row per parent-minted session. Authenticated has no privileges
-- on the table. user_metadata and app_metadata, including pl_sub, are not consulted.
-- Do not backfill from auth.sessions: that would authorize password sessions.
-- Sessions minted before the table exists have no row. After apply they are denied until
-- a new parent sign-in writes a grant. Refresh of a row that already exists slides
-- expires_at in the app; it does not require a new session id.
--
-- Boundaries this does not seal by itself
-- 1. Mixed policies (auth.uid() OR is_admin() / nura_is_admin()). A table-wide restrictive
--    policy would also bind the ops path, and requireApiAdmin still reads with the user
--    JWT. Those tables are skipped below. The owner half stays open to a password JWT
--    until each policy is rewritten to (owner-check AND parent_session_ok()) OR is_admin().
--    profiles SELECT in 000001 is the leading example. That rewrite is not done here.
-- 2. realtime.messages (000220) lives in schema realtime and mixes auth.uid() with
--    is_admin(). The payload is an empty ping. postgres_changes row payloads follow the
--    underlying table's RLS, so owner-only tables covered below are covered for those
--    payloads once this file is applied.
-- 3. Supabase Storage: this repo has no storage.objects policies and no supabase.storage
--    client. Live buckets created outside git are not visible here.
-- 4. SECURITY DEFINER RPCs bypass RLS. After the in-repo grants and revokes, EXECUTE for
--    authenticated remains: is_admin(), nura_is_admin(uuid), demo_access_blocks_admin(uuid),
--    admin_has_passkey(), iam_my_permission(text, text), and challenge_public_stats()
--    (aggregate counts, also granted to anon). 000090 revokes the user-scoped counters
--    (notification increment, last-responded, kickoff counts, guardian SOS count).
--    A later grant, or a live database that drifted, would bypass the policies below.
-- 5. Service-role clients bypass RLS. completeOnboarding uses that client and is gated by
--    the parent provision proof before createUser. Other service-role jobs are not user JWTs.

create table if not exists public.parent_session_grants (
  user_id uuid not null,
  session_id uuid not null,
  parent_sub text not null,
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  entitlement_revoked_at timestamptz,
  primary key (user_id, session_id)
);

alter table public.parent_session_grants enable row level security;
revoke all on table public.parent_session_grants from public, anon, authenticated;
grant select, insert, update, delete on table public.parent_session_grants to service_role;

create or replace function public.parent_session_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when coalesce((
      select s.signin from public.platform_link_settings s where s.id = 1
    ), 'off') not in ('test', 'all') then true
    when coalesce(auth.uid()::text, '') = '' then false
    when coalesce(auth.jwt() ->> 'session_id', '') = '' then false
    else exists (
      select 1
      from public.parent_session_grants g
      where g.user_id = auth.uid()
        and g.session_id::text = auth.jwt() ->> 'session_id'
        and g.revoked_at is null
        and g.entitlement_revoked_at is null
        and g.expires_at > now()
    )
  end
$$;

revoke all on function public.parent_session_ok() from public, anon, authenticated;
grant execute on function public.parent_session_ok() to authenticated, service_role;

-- Owner-only tables: one restrictive policy AND-ed with the existing auth.uid() policies.
-- Tables that mention is_admin or nura_is_admin are skipped on purpose (see header).
do $$
declare r record;
begin
  for r in
    select n.nspname, c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relrowsecurity
      and c.relname <> 'parent_session_grants'
      and not exists (
        select 1 from pg_policies p
        where p.schemaname = n.nspname
          and p.tablename = c.relname
          and (
            coalesce(p.qual, '') ilike '%is_admin%'
            or coalesce(p.with_check, '') ilike '%is_admin%'
            or coalesce(p.qual, '') ilike '%nura_is_admin%'
            or coalesce(p.with_check, '') ilike '%nura_is_admin%'
          )
      )
      and exists (
        select 1 from pg_policies p
        where p.schemaname = n.nspname
          and p.tablename = c.relname
          and (
            coalesce(p.qual, '') ilike '%auth.uid()%'
            or coalesce(p.with_check, '') ilike '%auth.uid()%'
          )
      )
  loop
    execute format('drop policy if exists parent_session_required on %I.%I', r.nspname, r.relname);
    execute format(
      'create policy parent_session_required on %I.%I as restrictive for all to authenticated using (public.parent_session_ok()) with check (public.parent_session_ok())',
      r.nspname, r.relname
    );
  end loop;
end $$;
