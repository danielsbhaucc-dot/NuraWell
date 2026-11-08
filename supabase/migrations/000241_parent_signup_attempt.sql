-- Each signup claim has one attempt owner. finish, fail and retry must present that
-- attempt. A worker whose lease expired cannot finish, release, or delete the session
-- of the worker that took over. Cleanup deletes only the session id this attempt minted.
-- service_role is the only caller. anon and authenticated have no access.
-- The flag on field encryption is not touched here.

alter table public.parent_signup_claims
  add column if not exists attempt_id uuid;
update public.parent_signup_claims
  set attempt_id = gen_random_uuid()
  where attempt_id is null;
alter table public.parent_signup_claims
  alter column attempt_id set not null;

create or replace function public.parent_signup_begin(p_nonce text, p_sub text, p_email text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  row public.parent_signup_claims;
  fresh uuid;
begin
  if p_nonce is null or char_length(p_nonce) < 16 or char_length(p_nonce) > 128
     or p_sub is null or char_length(p_sub) < 4
     or p_email is null or char_length(p_email) < 3 then
    return 'rejected';
  end if;
  fresh := gen_random_uuid();
  insert into public.parent_signup_claims (nonce, parent_sub, email, state, attempt_id)
  values (p_nonce, p_sub, p_email, 'open', fresh)
  on conflict (nonce) do nothing;
  if found then
    return 'claimed:' || fresh::text;
  end if;
  select * into row from public.parent_signup_claims where nonce = p_nonce for update;
  if row.nonce is null then
    return 'rejected';
  end if;
  if row.parent_sub <> p_sub or row.email <> p_email then
    return 'mismatch';
  end if;
  if row.state = 'done' or row.session_id is not null then
    return 'done';
  end if;
  if row.state = 'failed'
     or (row.state = 'open' and row.updated_at < now() - interval '2 minutes') then
    fresh := gen_random_uuid();
    update public.parent_signup_claims
      set state = 'open', session_id = null, attempt_id = fresh, updated_at = now()
      where nonce = p_nonce;
    return 'claimed:' || fresh::text;
  end if;
  return 'busy';
end;
$$;

drop function if exists public.parent_signup_note_user(text, uuid);
create or replace function public.parent_signup_note_user(p_nonce text, p_attempt uuid, p_user uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.parent_signup_claims
    set user_id = p_user, updated_at = now()
    where nonce = p_nonce and attempt_id = p_attempt and state = 'open' and session_id is null
      and (user_id is null or user_id = p_user);
  return found;
end;
$$;

drop function if exists public.parent_signup_user(text);
create or replace function public.parent_signup_user(p_nonce text, p_attempt uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select user_id from public.parent_signup_claims
  where nonce = p_nonce and attempt_id = p_attempt and state = 'open' and session_id is null
$$;

drop function if exists public.parent_signup_finish(text, uuid, uuid);
create or replace function public.parent_signup_finish(p_nonce text, p_attempt uuid, p_user uuid, p_session uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user is null or p_session is null or p_attempt is null then
    return false;
  end if;
  update public.parent_signup_claims
    set state = 'done', user_id = p_user, session_id = p_session, updated_at = now()
    where nonce = p_nonce and attempt_id = p_attempt and state = 'open'
      and (user_id is null or user_id = p_user);
  return found;
end;
$$;

drop function if exists public.parent_signup_abort(text);
create or replace function public.parent_signup_fail(p_nonce text, p_attempt uuid, p_session uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  row public.parent_signup_claims;
begin
  if p_attempt is null then
    return false;
  end if;
  select * into row from public.parent_signup_claims where nonce = p_nonce for update;
  if row.nonce is null or row.attempt_id is distinct from p_attempt or row.state = 'done' then
    return false;
  end if;
  if row.session_id is not null and (p_session is null or row.session_id is distinct from p_session) then
    return false;
  end if;
  if p_session is not null and row.user_id is not null and to_regclass('auth.sessions') is not null then
    delete from auth.sessions where id = p_session and user_id = row.user_id;
  end if;
  if p_session is not null and row.user_id is not null and to_regclass('public.parent_session_grants') is not null then
    update public.parent_session_grants
      set revoked_at = coalesce(revoked_at, now())
      where user_id = row.user_id and session_id = p_session;
  end if;
  update public.parent_signup_claims
    set state = 'failed', session_id = null, updated_at = now()
    where nonce = p_nonce and attempt_id = p_attempt and state = 'open';
  return found;
end;
$$;

revoke all on function public.parent_signup_begin(text, text, text) from public, anon, authenticated;
revoke all on function public.parent_signup_note_user(text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.parent_signup_user(text, uuid) from public, anon, authenticated;
revoke all on function public.parent_signup_finish(text, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.parent_signup_fail(text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.parent_signup_begin(text, text, text) to service_role;
grant execute on function public.parent_signup_note_user(text, uuid, uuid) to service_role;
grant execute on function public.parent_signup_user(text, uuid) to service_role;
grant execute on function public.parent_signup_finish(text, uuid, uuid, uuid) to service_role;
grant execute on function public.parent_signup_fail(text, uuid, uuid) to service_role;
