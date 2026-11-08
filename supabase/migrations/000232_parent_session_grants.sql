-- Parent session grants. The column platform_link_settings.signin is the only enforcement switch.
-- The app reads that same column. PLATFORM_SIGNIN_MODE cannot turn database enforcement off.
-- Explicit signin = 'off' keeps today's policies (break-glass for product users and ops together).
-- 'test' or 'all' requires a server-written grant for auth.uid() + the JWT session_id.
-- A missing row, an unknown value, or any error fails closed. There is no is_admin exemption.
--
-- Ops prerequisite, before setting signin to test or all:
--   this migration is applied; ops operators can complete parent sign-in (app_metadata.pl_sub);
--   parent OIDC is configured so that sign-in can write a grant. Device approval still runs after that.
--   Restoring signin = 'off' is the break-glass. Do not backfill grants from auth.sessions.
--
-- Lease: parent_grant_lease() is 120 seconds. Every protected read evaluates expires_at,
-- revoked_at and entitlement_revoked_at. Renewal of an already-expired or revoked row is rejected.
-- A revocation the server has observed is written immediately. One it has not observed cannot
-- outlive the lease, including for a direct PostgREST call that never hits the app.
--
-- Supabase Storage buckets are not created in this repository. Inventory storage.objects
-- policies on the live project before enabling test/all. This migration does not do that inventory.
--
-- service_role bypasses RLS and is the only writer of grants. PostgREST uses the authenticated
-- role, which does not bypass RLS.

create or replace function public.parent_grant_lease() returns interval
language sql immutable
set search_path = ''
as $$ select interval '120 seconds' $$;

create table if not exists public.parent_session_grants (
  user_id uuid not null,
  session_id uuid not null,
  parent_sub text not null,
  issued_at timestamptz not null default now(),
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
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v text;
begin
  select s.signin into v from public.platform_link_settings s where s.id = 1;
  if v is null or v not in ('off', 'test', 'all') then
    return false;
  end if;
  if v = 'off' then
    return true;
  end if;
  if auth.uid() is null or coalesce(auth.jwt() ->> 'session_id', '') = '' then
    return false;
  end if;
  return exists (
    select 1
    from public.parent_session_grants g
    where g.user_id = auth.uid()
      and g.session_id::text = auth.jwt() ->> 'session_id'
      and g.revoked_at is null
      and g.entitlement_revoked_at is null
      and g.expires_at > now()
  );
exception when others then
  return false;
end;
$$;

revoke all on function public.parent_session_ok() from public, anon, authenticated;
grant execute on function public.parent_session_ok() to authenticated, service_role;

create or replace function public.parent_session_issue(p_user uuid, p_session uuid, p_parent_sub text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v timestamptz := now() + public.parent_grant_lease();
begin
  if p_user is null or p_session is null or coalesce(p_parent_sub, '') = '' then
    return null;
  end if;
  insert into public.parent_session_grants (user_id, session_id, parent_sub, issued_at, expires_at, revoked_at, entitlement_revoked_at)
  values (p_user, p_session, p_parent_sub, now(), v, null, null)
  on conflict (user_id, session_id) do update
    set parent_sub = excluded.parent_sub,
        issued_at = excluded.issued_at,
        expires_at = excluded.expires_at,
        revoked_at = null,
        entitlement_revoked_at = null;
  return v;
end;
$$;

create or replace function public.parent_session_renew(p_user uuid, p_session uuid, p_eligible boolean)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v timestamptz;
begin
  if p_eligible is distinct from true then
    update public.parent_session_grants
      set entitlement_revoked_at = coalesce(entitlement_revoked_at, now())
      where user_id = p_user and session_id = p_session and revoked_at is null and expires_at > now();
    return null;
  end if;
  update public.parent_session_grants
    set expires_at = now() + public.parent_grant_lease(),
        entitlement_revoked_at = null
    where user_id = p_user
      and session_id = p_session
      and revoked_at is null
      and entitlement_revoked_at is null
      and expires_at > now()
    returning expires_at into v;
  return v;
end;
$$;

create or replace function public.parent_session_revoke(p_user uuid, p_session uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.parent_session_grants
    set revoked_at = coalesce(revoked_at, now())
    where user_id = p_user and session_id = p_session;
end;
$$;

revoke all on function public.parent_session_issue(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.parent_session_renew(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.parent_session_revoke(uuid, uuid) from public, anon, authenticated;
grant execute on function public.parent_session_issue(uuid, uuid, text) to service_role;
grant execute on function public.parent_session_renew(uuid, uuid, boolean) to service_role;
grant execute on function public.parent_session_revoke(uuid, uuid) to service_role;

-- Authenticated helpers keep their grants (policies call them) but a password session
-- no longer counts as ops authority while enforcement is on. Explicit 'off' still short-circuits.
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.parent_session_ok() and exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and not public.demo_access_blocks_admin(auth.uid())
  ) and public.iam_has_permission(auth.uid(), 'nurawell', 'admin.access');
$$;

create or replace function public.nura_is_admin(uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.parent_session_ok() and exists (
    select 1 from public.profiles p
    where p.id = uid
      and lower(btrim(p.role::text)) in ('admin', 'administrator', 'super_admin', 'superadmin', 'owner', 'ops')
      and not public.demo_access_blocks_admin(uid)
  ) and public.iam_has_permission(uid, 'nurawell', 'admin.access');
$$;

create or replace function public.iam_my_permission(product text, perm text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.parent_session_ok() and public.iam_has_permission(auth.uid(), product, perm);
$$;

-- Restrictive policies AND with every existing permissive policy, including is_admin() branches.
-- Authenticated only: anon public reads stay as they are. The grants table is excluded.
do $$
declare r record;
begin
  for r in
    select n.nspname, c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('public', 'realtime')
      and c.relkind = 'r'
      and c.relrowsecurity
      and c.relname <> 'parent_session_grants'
      and exists (
        select 1 from pg_policies p
        where p.schemaname = n.nspname
          and p.tablename = c.relname
          and (
            coalesce(p.qual, '') ilike '%auth.uid()%'
            or coalesce(p.with_check, '') ilike '%auth.uid()%'
            or coalesce(p.qual, '') ilike '%is_admin%'
            or coalesce(p.with_check, '') ilike '%is_admin%'
            or coalesce(p.qual, '') ilike '%nura_is_admin%'
            or coalesce(p.with_check, '') ilike '%nura_is_admin%'
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
