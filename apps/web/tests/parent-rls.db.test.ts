import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Real PostgreSQL on this machine. Not production, not a remote project.
 * Policies below are the expressions from 000001, 000126 and 000220.
 * iam_has_permission and demo_access_blocks_admin are fixture stubs so the
 * production is_admin() body from 000232 can run without the whole IAM schema.
 * Storage is not installed here; the test records that and does not claim a live inventory.
 */
const DB = 'nurawell_parent_rls';
const migration = join(process.cwd(), '../../supabase/migrations/000232_parent_session_grants.sql');
const USER = '11111111-1111-4111-8111-111111111111';
const ADMIN = '22222222-2222-4222-8222-222222222222';
const PARENT_SESSION = '33333333-3333-4333-8333-333333333333';
const COPIED_SESSION = '44444444-4444-4444-8444-444444444444';
const ADMIN_SESSION = '55555555-5555-4555-8555-555555555555';

function countAs(userId: string, sessionId: string): string {
  const out = psql(DB, `
    select set_config('request.jwt.claims', '{"sub":"${userId}","session_id":"${sessionId}","role":"authenticated"}', false);
    set role authenticated;
    select count(*)::text from public.profiles;
  `);
  return out.trim().split('\n').pop() ?? '';
}

function psql(database: string, sql: string): string {
  return execFileSync('sudo', ['-u', 'postgres', 'psql', '-d', database, '-v', 'ON_ERROR_STOP=1', '-t', '-A', '-c', sql], {
    encoding: 'utf8',
  });
}

function psqlScript(database: string, sql: string): string {
  return execFileSync('sudo', ['-u', 'postgres', 'psql', '-d', database, '-v', 'ON_ERROR_STOP=1'], {
    encoding: 'utf8',
    input: sql,
  });
}

describe('parent session RLS on local Postgres', () => {
  it('enforces combined permissive and restrictive policies, grants, RPC and realtime', () => {
    psql('postgres', `DROP DATABASE IF EXISTS ${DB}`);
    psql('postgres', `CREATE DATABASE ${DB}`);
    psqlScript(DB, setupSql());
    const before = countAs(USER, '99999999-9999-4999-8999-999999999999');
    expect(before).toBe('1');
    psqlScript(DB, readFileSync(migration, 'utf8'));
    const afterOff = countAs(USER, '99999999-9999-4999-8999-999999999999');
    expect(afterOff).toBe('1');
    psqlScript(DB, checksSql());
    const resumed = countAs(USER, PARENT_SESSION);
    expect(resumed).toBe('1');
    const copied = psql(DB, `
      select set_config('request.jwt.claims', '{"sub":"${USER}","session_id":"${COPIED_SESSION}","role":"authenticated"}', false);
      set role authenticated;
      select count(*)::text from public.profiles;
    `).trim().split('\n').pop();
    expect(copied).toBe('0');
    const storage = psql(DB, `select count(*)::text from pg_namespace where nspname = 'storage'`).trim();
    expect(storage).toBe('0');
    psql('postgres', `DROP DATABASE IF EXISTS ${DB}`);
  });
});

function setupSql(): string {
  return `
create extension if not exists pgcrypto;
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')
  ), '')::uuid
$$;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;
grant usage on schema auth to authenticated, anon, service_role;
grant execute on function auth.uid() to authenticated, anon, service_role;
grant execute on function auth.jwt() to authenticated, anon, service_role;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create table if not exists auth.sessions (id uuid primary key, user_id uuid not null);
create table public.platform_link_settings (
  id smallint primary key check (id = 1),
  signin text not null default 'off' check (signin in ('off', 'test', 'all'))
);
insert into public.platform_link_settings (id, signin) values (1, 'off');
create table public.admin_passkeys (user_id uuid primary key);
insert into public.admin_passkeys (user_id) values ('${ADMIN}');
create table public.demo_access_sessions (user_id uuid, revoked_at timestamptz, expires_at timestamptz);
insert into public.demo_access_sessions (user_id, revoked_at, expires_at) values ('${USER}', null, now() + interval '1 day');
create or replace function public.demo_access_blocks_admin(uid uuid) returns boolean
language sql stable as $$ select false $$;
create or replace function public.iam_has_permission(uid uuid, product text, perm text) returns boolean
language sql stable as $$ select uid is not null $$;
create table public.profiles (
  id uuid primary key,
  role text not null,
  full_name text
);
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') $$;
insert into public.profiles (id, role, full_name) values
  ('${USER}', 'user', 'user-row'),
  ('${ADMIN}', 'admin', 'ops-row');
alter table public.profiles enable row level security;
create policy "Users can view own profile" on public.profiles for select using (auth.uid() = id or public.is_admin());
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);
grant select, update on public.profiles to authenticated;
create table public.secure_vault_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  ref text not null
);
insert into public.secure_vault_items (user_id, ref) values ('${USER}', 'own'), ('${ADMIN}', 'ops');
alter table public.secure_vault_items enable row level security;
revoke all on public.secure_vault_items from anon;
create policy "vault owner select" on public.secure_vault_items for select to authenticated using (user_id = (select auth.uid()));
create policy "vault owner delete" on public.secure_vault_items for delete to authenticated using (user_id = (select auth.uid()));
grant select, delete on public.secure_vault_items to authenticated;
create schema if not exists realtime;
create table realtime.messages (
  id bigint generated always as identity primary key,
  extension text,
  topic text
);
insert into realtime.messages (extension, topic) values
  ('broadcast', 'ops-login:${USER}'),
  ('broadcast', 'gideon-identities');
create or replace function realtime.topic() returns text language sql stable as $$
  select nullif(current_setting('realtime.topic', true), '')
$$;
alter table realtime.messages enable row level security;
create policy ops_rt_ping_listen on realtime.messages for select to authenticated using (
  realtime.messages.extension = 'broadcast' and (
    realtime.topic() = 'ops-login:' || (select auth.uid())::text
    or (realtime.topic() in ('gideon-identities', 'ops-admin-notify') and (select public.is_admin()))
  )
);
grant usage on schema realtime to authenticated;
grant execute on function realtime.topic() to authenticated;
grant select on realtime.messages to authenticated;
create table public.challenge_enrollments (id int primary key, is_demo boolean, status text);
insert into public.challenge_enrollments values (1, false, 'active');
create or replace function public.challenge_public_stats() returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.challenge_enrollments where is_demo = false and status = 'active'
$$;
grant execute on function public.challenge_public_stats() to anon, authenticated;
insert into auth.sessions (id, user_id) values ('${COPIED_SESSION}', '${USER}');
`;
}

function checksSql(): string {
  return `
create or replace function public.rows_as(claims text, rel text) returns int language plpgsql as $$
declare n int;
begin
  perform set_config('request.jwt.claims', claims, true);
  execute 'set local role authenticated';
  execute format('select count(*) from %s', rel) into n;
  return n;
end $$;

create or replace function public.updated_as(claims text) returns int language plpgsql as $$
declare n int;
begin
  perform set_config('request.jwt.claims', claims, true);
  execute 'set local role authenticated';
  update public.profiles set full_name = 'seen'
    where id = nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.deleted_as(claims text) returns int language plpgsql as $$
declare n int;
begin
  perform set_config('request.jwt.claims', claims, true);
  execute 'set local role authenticated';
  delete from public.secure_vault_items
    where user_id = nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.bool_as(claims text, fn text) returns boolean language plpgsql as $$
declare ok boolean;
begin
  perform set_config('request.jwt.claims', claims, true);
  execute 'set local role authenticated';
  execute format('select %s', fn) into ok;
  return ok;
end $$;

create or replace function public.fail(label text) returns void language plpgsql as $$
begin
  raise exception 'parent rls: %', label;
end $$;

-- No backfill from auth.sessions.
select public.fail('sessions were copied into grants')
where exists (select 1 from public.parent_session_grants);

-- Restrictive policy is actually restrictive and sits beside the permissive owner policy.
select public.fail('restrictive flag missing')
where not exists (
  select 1 from pg_policy
  where polname = 'parent_session_required' and polrelid = 'public.profiles'::regclass and polpermissive = false
);
select public.fail('permissive owner policy missing')
where not exists (
  select 1 from pg_policy
  where polname = 'Users can view own profile' and polrelid = 'public.profiles'::regclass and polpermissive = true
);

select public.parent_session_issue('${USER}'::uuid, '${PARENT_SESSION}'::uuid, 'parent-sub');
select public.parent_session_issue('${USER}'::uuid, '${COPIED_SESSION}'::uuid, 'parent-sub');
select public.parent_session_issue('${ADMIN}'::uuid, '${ADMIN_SESSION}'::uuid, 'ops-sub');

-- signin is still off here: the migration must not change today's owner read.
select public.fail('migration changed off-mode read')
where public.rows_as('{"sub":"${USER}","session_id":"99999999-9999-4999-8999-999999999999","role":"authenticated"}', 'public.profiles') <> 1;
select public.fail('migration changed off-mode ops')
where public.bool_as('{"sub":"${ADMIN}","session_id":"99999999-9999-4999-8999-999999999999","role":"authenticated"}', 'public.is_admin()') is not true;

update public.platform_link_settings set signin = 'all' where id = 1;

-- Password JWT: a session id that was never issued.
select public.fail('password jwt read own profile')
where public.rows_as('{"sub":"${USER}","session_id":"99999999-9999-4999-8999-999999999999","role":"authenticated"}', 'public.profiles') <> 0;
select public.fail('password jwt read vault')
where public.rows_as('{"sub":"${USER}","session_id":"99999999-9999-4999-8999-999999999999","role":"authenticated"}', 'public.secure_vault_items') <> 0;
select public.fail('password jwt updated a profile')
where public.updated_as('{"sub":"${USER}","session_id":"99999999-9999-4999-8999-999999999999","role":"authenticated"}') <> 0;
select public.fail('password admin still is_admin')
where public.bool_as('{"sub":"${ADMIN}","session_id":"99999999-9999-4999-8999-999999999999","role":"authenticated"}', 'public.is_admin()');

-- Parent grant: own profile and own vault, not the other profile.
select public.fail('parent grant missed own profile')
where public.rows_as('{"sub":"${USER}","session_id":"${PARENT_SESSION}","role":"authenticated"}', 'public.profiles') <> 1;
select public.fail('parent grant missed own vault')
where public.rows_as('{"sub":"${USER}","session_id":"${PARENT_SESSION}","role":"authenticated"}', 'public.secure_vault_items') <> 1;
select public.fail('parent grant wrote another profile')
where public.updated_as('{"sub":"${USER}","session_id":"${PARENT_SESSION}","role":"authenticated"}') <> 1;
select public.fail('password jwt deleted a vault row')
where public.deleted_as('{"sub":"${USER}","session_id":"99999999-9999-4999-8999-999999999999","role":"authenticated"}') <> 0;
select public.fail('parent grant did not delete own vault row')
where public.deleted_as('{"sub":"${USER}","session_id":"${PARENT_SESSION}","role":"authenticated"}') <> 1;
select public.fail('parent user became admin')
where public.bool_as('{"sub":"${USER}","session_id":"${PARENT_SESSION}","role":"authenticated"}', 'public.is_admin()');

-- Ops with a parent grant can see both profiles. Ops without a grant cannot.
select public.fail('ops grant could not read profiles')
where public.rows_as('{"sub":"${ADMIN}","session_id":"${ADMIN_SESSION}","role":"authenticated"}', 'public.profiles') <> 2;
select public.fail('ops without grant read profiles')
where public.rows_as('{"sub":"${ADMIN}","session_id":"99999999-9999-4999-8999-999999999999","role":"authenticated"}', 'public.profiles') <> 0;

-- Realtime uses the same RLS. Password hears nothing. The granted user hears their topic only.
create or replace function public.realtime_as(claims text, topic text) returns int language plpgsql as $$
declare n int;
begin
  perform set_config('request.jwt.claims', claims, true);
  perform set_config('realtime.topic', topic, true);
  execute 'set local role authenticated';
  select count(*) into n from realtime.messages;
  return n;
end $$;
select public.fail('password heard realtime')
where public.realtime_as('{"sub":"${USER}","session_id":"99999999-9999-4999-8999-999999999999","role":"authenticated"}', 'ops-login:${USER}') <> 0;
-- 000220 keys off realtime.topic() (the subscription), not the row topic column.
select public.fail('granted user missed a subscription the existing policy allows')
where public.realtime_as('{"sub":"${USER}","session_id":"${PARENT_SESSION}","role":"authenticated"}', 'ops-login:${USER}') <> 2;
select public.fail('user heard an ops topic')
where public.realtime_as('{"sub":"${USER}","session_id":"${PARENT_SESSION}","role":"authenticated"}', 'gideon-identities') <> 0;
select public.fail('ops grant missed the ops topic')
where public.realtime_as('{"sub":"${ADMIN}","session_id":"${ADMIN_SESSION}","role":"authenticated"}', 'gideon-identities') <> 2;

-- Public aggregate stays callable and does not return profile names.
select public.fail('public stats hidden')
where public.bool_as('{"sub":"${USER}","session_id":"99999999-9999-4999-8999-999999999999","role":"authenticated"}', 'public.challenge_public_stats() = 1') is not true;

-- iam_my_permission is security definer and still requires the grant.
select public.fail('rpc without grant')
where public.bool_as('{"sub":"${USER}","session_id":"99999999-9999-4999-8999-999999999999","role":"authenticated"}', 'public.iam_my_permission(''nurawell'', ''admin.access'')');
select public.fail('rpc with grant')
where public.bool_as('{"sub":"${USER}","session_id":"${PARENT_SESSION}","role":"authenticated"}', 'public.iam_my_permission(''nurawell'', ''admin.access'')') is not true;

-- test cohort: an unflagged password session keeps its own row. A flagged session does not, until a grant exists.
update public.platform_link_settings set signin = 'test' where id = 1;
select public.fail('test mode locked an unflagged user')
where public.rows_as('{"sub":"${USER}","session_id":"99999999-9999-4999-8999-999999999999","role":"authenticated","app_metadata":{"pl_enforce_test":false}}', 'public.profiles') <> 1;
select public.fail('test mode let a flagged user through without a grant')
where public.rows_as('{"sub":"${USER}","session_id":"99999999-9999-4999-8999-999999999999","role":"authenticated","app_metadata":{"pl_enforce_test":true}}', 'public.profiles') <> 0;
select public.fail('test mode locked unflagged ops')
where public.bool_as('{"sub":"${ADMIN}","session_id":"99999999-9999-4999-8999-999999999999","role":"authenticated","app_metadata":{}}', 'public.is_admin()') is not true;
update public.platform_link_settings set signin = 'all' where id = 1;

-- Entitlement revocation is visible on the next read, before the lease ends.
select public.fail('renew eligible=false returned a lease')
where public.parent_session_renew('${USER}'::uuid, '${PARENT_SESSION}'::uuid, false, true) is not null;
select public.fail('revoked entitlement still readable')
where public.rows_as('{"sub":"${USER}","session_id":"${PARENT_SESSION}","role":"authenticated"}', 'public.profiles') <> 0;
select public.fail('stale revalidation cleared an entitlement revocation')
where public.parent_session_renew('${USER}'::uuid, '${PARENT_SESSION}'::uuid, true, true) is not null;

-- A new parent login restores the row. An expired lease is readable again only after a revalidated renewal.
select public.parent_session_issue('${USER}'::uuid, '${PARENT_SESSION}'::uuid, 'parent-sub');
update public.parent_session_grants set expires_at = now() - interval '1 second'
where user_id = '${USER}' and session_id = '${PARENT_SESSION}';
select public.fail('expired lease still readable before renewal')
where public.rows_as('{"sub":"${USER}","session_id":"${PARENT_SESSION}","role":"authenticated"}', 'public.profiles') <> 0;
select public.fail('cookie-only renew extended the lease')
where public.parent_session_renew('${USER}'::uuid, '${PARENT_SESSION}'::uuid, true, false) is not null;
select public.fail('revalidated renew did not resume an active session')
where public.parent_session_renew('${USER}'::uuid, '${PARENT_SESSION}'::uuid, true, true) is null;
select public.fail('resumed session could not read')
where public.rows_as('{"sub":"${USER}","session_id":"${PARENT_SESSION}","role":"authenticated"}', 'public.profiles') <> 1;

-- Three further lease windows, with the clock moved by expiring the row between them.
update public.parent_session_grants set expires_at = now() - interval '1 second' where user_id = '${USER}' and session_id = '${PARENT_SESSION}';
select public.fail('window 2 renew failed') where public.parent_session_renew('${USER}'::uuid, '${PARENT_SESSION}'::uuid, true, true) is null;
update public.parent_session_grants set expires_at = now() - interval '1 second' where user_id = '${USER}' and session_id = '${PARENT_SESSION}';
select public.fail('window 3 renew failed') where public.parent_session_renew('${USER}'::uuid, '${PARENT_SESSION}'::uuid, true, true) is null;
update public.parent_session_grants set expires_at = now() - interval '1 second' where user_id = '${USER}' and session_id = '${PARENT_SESSION}';
select public.fail('window 4 renew failed') where public.parent_session_renew('${USER}'::uuid, '${PARENT_SESSION}'::uuid, true, true) is null;
select public.fail('session unusable after several windows')
where public.rows_as('{"sub":"${USER}","session_id":"${PARENT_SESSION}","role":"authenticated"}', 'public.profiles') <> 1;

-- Eligible renewal of a live lease works. Logout of the copied session does not.
select public.fail('live renew failed')
where public.parent_session_renew('${USER}'::uuid, '${PARENT_SESSION}'::uuid, true, true) is null;
select public.parent_session_revoke('${USER}'::uuid, '${COPIED_SESSION}'::uuid);
select public.fail('revoked copied session still readable')
where public.rows_as('{"sub":"${USER}","session_id":"${COPIED_SESSION}","role":"authenticated"}', 'public.profiles') <> 0;
select public.fail('logout revoked the other session too')
where public.rows_as('{"sub":"${USER}","session_id":"${PARENT_SESSION}","role":"authenticated"}', 'public.profiles') <> 1;

-- Authenticated cannot write grants.
do $$
begin
  begin
    execute 'set local role authenticated';
    perform public.parent_session_renew('${USER}'::uuid, '${PARENT_SESSION}'::uuid, true, true);
    raise exception 'parent rls: authenticated renewed a grant';
  exception
    when insufficient_privilege then null;
  end;
end $$;

-- Explicit off restores the owner policy. A missing settings row fails closed.
update public.platform_link_settings set signin = 'off' where id = 1;
select public.fail('off mode hid the owner row')
where public.rows_as('{"sub":"${USER}","session_id":"99999999-9999-4999-8999-999999999999","role":"authenticated"}', 'public.profiles') <> 1;
select public.fail('off mode opened the other row')
where public.rows_as('{"sub":"${USER}","session_id":"99999999-9999-4999-8999-999999999999","role":"authenticated"}', 'public.profiles') > 1;
delete from public.platform_link_settings where id = 1;
select public.fail('missing switch allowed a read')
where public.rows_as('{"sub":"${USER}","session_id":"${PARENT_SESSION}","role":"authenticated"}', 'public.profiles') <> 0;
insert into public.platform_link_settings (id, signin) values (1, 'all');

-- Definer that selects every profile bypasses RLS until it also filters the caller.
create or replace function public.leak_profiles() returns setof text
language sql security definer set search_path = public as $$ select full_name from public.profiles $$;
grant execute on function public.leak_profiles() to authenticated;
select public.fail('definer did not bypass')
where public.bool_as('{"sub":"${USER}","session_id":"99999999-9999-4999-8999-999999999999","role":"authenticated"}', '(select count(*) from public.leak_profiles()) = 2') is not true;
create or replace function public.leak_profiles() returns setof text
language sql security definer set search_path = public as $$
  select full_name from public.profiles where public.parent_session_ok() and id = auth.uid()
$$;
select public.fail('filtered definer still leaked')
where public.bool_as('{"sub":"${USER}","session_id":"99999999-9999-4999-8999-999999999999","role":"authenticated"}', '(select count(*) from public.leak_profiles()) = 0') is not true;
select public.fail('filtered definer hid the caller')
where public.bool_as('{"sub":"${USER}","session_id":"${PARENT_SESSION}","role":"authenticated"}', '(select count(*) from public.leak_profiles()) = 1') is not true;
`;
}
