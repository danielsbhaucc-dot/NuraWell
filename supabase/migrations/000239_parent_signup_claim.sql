-- One parent signup transaction (the signed provision nonce) may mint one product session.
-- The row is the lock across server processes. Email is not the key: a second browser
-- with the same email and a different nonce does not receive the first session.
-- service_role is the only writer. anon and authenticated have no access.
-- A failed attempt stays retryable. A finished attempt does not mint again and does not
-- return the session to a later caller.

create table if not exists public.parent_signup_claims (
  nonce text primary key check (char_length(nonce) between 16 and 128),
  parent_sub text not null check (char_length(parent_sub) between 4 and 200),
  email text not null check (char_length(email) between 3 and 320),
  state text not null default 'open' check (state in ('open', 'done', 'failed')),
  user_id uuid,
  session_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.parent_signup_claims enable row level security;
revoke all on table public.parent_signup_claims from public, anon, authenticated;
grant select, insert, update, delete on table public.parent_signup_claims to service_role;

create or replace function public.parent_signup_begin(p_nonce text, p_sub text, p_email text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  row public.parent_signup_claims;
begin
  if p_nonce is null or char_length(p_nonce) < 16 or char_length(p_nonce) > 128
     or p_sub is null or char_length(p_sub) < 4
     or p_email is null or char_length(p_email) < 3 then
    return 'rejected';
  end if;
  insert into public.parent_signup_claims (nonce, parent_sub, email, state)
  values (p_nonce, p_sub, p_email, 'open')
  on conflict (nonce) do nothing;
  if found then
    return 'claimed';
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
    update public.parent_signup_claims
      set state = 'open', session_id = null, updated_at = now()
      where nonce = p_nonce;
    return 'claimed';
  end if;
  return 'busy';
end;
$$;

create or replace function public.parent_signup_note_user(p_nonce text, p_user uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.parent_signup_claims
    set user_id = p_user, updated_at = now()
    where nonce = p_nonce and state = 'open' and session_id is null
      and (user_id is null or user_id = p_user);
  return found;
end;
$$;

create or replace function public.parent_signup_finish(p_nonce text, p_user uuid, p_session uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user is null or p_session is null then
    return false;
  end if;
  update public.parent_signup_claims
    set state = 'done', user_id = p_user, session_id = p_session, updated_at = now()
    where nonce = p_nonce and state = 'open' and (user_id is null or user_id = p_user);
  return found;
end;
$$;

create or replace function public.parent_signup_abort(p_nonce text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.parent_signup_claims
    set state = 'failed', session_id = null, updated_at = now()
    where nonce = p_nonce and state = 'open' and session_id is null;
  return found;
end;
$$;

create or replace function public.parent_signup_user(p_nonce text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select user_id from public.parent_signup_claims
  where nonce = p_nonce and state = 'open' and session_id is null
$$;

revoke all on function public.parent_signup_begin(text, text, text) from public, anon, authenticated;
revoke all on function public.parent_signup_note_user(text, uuid) from public, anon, authenticated;
revoke all on function public.parent_signup_finish(text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.parent_signup_abort(text) from public, anon, authenticated;
revoke all on function public.parent_signup_user(text) from public, anon, authenticated;
grant execute on function public.parent_signup_begin(text, text, text) to service_role;
grant execute on function public.parent_signup_note_user(text, uuid) to service_role;
grant execute on function public.parent_signup_finish(text, uuid, uuid) to service_role;
grant execute on function public.parent_signup_abort(text) to service_role;
grant execute on function public.parent_signup_user(text) to service_role;
