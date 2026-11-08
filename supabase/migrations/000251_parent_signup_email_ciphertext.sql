-- parent_signup_claims.email: seal at rest (enc:v2) + keyed HMAC email_bidx for SQL equality.
-- Lock stays nonce (PK). App seals + computes bidx before parent_signup_begin; missing material → rejected.
-- Legacy plaintext rows retained (email_bidx null): done short-circuit if parent_sub matches; open reclaim → mismatch.
-- No hosted backfill/delete. Enforcement flag not touched. service_role-only unchanged.
-- Rollback: restore parent_signup_begin(text,text,text) from 000241; email_bidx column may remain unused.

alter table public.parent_signup_claims
  add column if not exists email_bidx text;

alter table public.parent_signup_claims drop constraint if exists parent_signup_claims_email_check;
alter table public.parent_signup_claims add constraint parent_signup_claims_email_check check (
  (email like 'enc:v2:%' and char_length(email) <= 4000)
  or (email not like 'enc:%' and char_length(email) between 3 and 320)
);

alter table public.parent_signup_claims drop constraint if exists parent_signup_claims_email_bidx_check;
alter table public.parent_signup_claims add constraint parent_signup_claims_email_bidx_check check (
  email_bidx is null
  or (char_length(email_bidx) between 16 and 64 and email_bidx ~ '^[A-Za-z0-9_-]+$')
);

drop function if exists public.parent_signup_begin(text, text, text);

create or replace function public.parent_signup_begin(
  p_nonce text,
  p_sub text,
  p_email_sealed text,
  p_email_bidx text
)
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
     or p_sub is null or char_length(p_sub) < 4 then
    return 'rejected';
  end if;
  -- Missing sealed email or keyed blind index → fail closed before any state/user creation.
  if p_email_sealed is null or p_email_sealed not like 'enc:v2:%' or char_length(p_email_sealed) < 16
     or p_email_bidx is null or char_length(p_email_bidx) < 16 or char_length(p_email_bidx) > 64
     or p_email_bidx !~ '^[A-Za-z0-9_-]+$' then
    return 'rejected';
  end if;

  fresh := gen_random_uuid();
  insert into public.parent_signup_claims (nonce, parent_sub, email, email_bidx, state, attempt_id)
  values (p_nonce, p_sub, p_email_sealed, p_email_bidx, 'open', fresh)
  on conflict (nonce) do nothing;
  if found then
    return 'claimed:' || fresh::text;
  end if;

  select * into row from public.parent_signup_claims where nonce = p_nonce for update;
  if row.nonce is null then
    return 'rejected';
  end if;
  if row.parent_sub <> p_sub then
    return 'mismatch';
  end if;

  -- Keyed equality only. Never compare ciphertext to plaintext.
  if row.email_bidx is not null then
    if row.email_bidx is distinct from p_email_bidx then
      return 'mismatch';
    end if;
  elsif row.email like 'enc:v2:%' then
    return 'mismatch';
  else
    -- Legacy plaintext retained (not backfilled): idempotent done only; open reclaim fail-closed.
    if row.state = 'done' or row.session_id is not null then
      return 'done';
    end if;
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

revoke all on function public.parent_signup_begin(text, text, text, text) from public, anon, authenticated;
grant execute on function public.parent_signup_begin(text, text, text, text) to service_role;
