-- Unique bracket tokens (outbound guard): [[PERSON*]] is another person, not the user -> dropped, not replaced by the user's name.
create or replace function public.restore_pii_placeholders(p_text text, p_user_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_first text;
  v_out text;
begin
  if p_text is null or p_text !~ '\[' then
    return p_text;
  end if;
  if p_user_id is not null then
    select nullif(split_part(btrim(coalesce(full_name, '')), ' ', 1), '')
      into v_first from profiles where id = p_user_id;
  end if;
  v_out := regexp_replace(
    p_text,
    '\[\[?\s*(PERSON_NAME|USER_FIRST_NAME|USER_FULL_NAME|FIRST_NAME|FIRSTNAME|NAME|USER|שם)\s*\]\]?',
    coalesce(v_first, ''), 'gi');
  v_out := regexp_replace(
    v_out,
    '\[\[?\s*(ADDRESS|USER_ADDRESS|USER_PHONE|PHONE|USER_EMAIL|EMAIL|USER_ID|כתובת)\s*\]\]?',
    '', 'gi');
  -- any other bracket token ([[PERSON]], [[PERSON_2]], [[USER_LAST_NAME]], [[USER_EMAIL_2]] ...) is dropped
  v_out := regexp_replace(v_out, '\[\[\s*[A-Z][A-Z0-9_]*\s*\]\]', '', 'g');
  v_out := regexp_replace(v_out, '[ \t]{2,}', ' ', 'g');
  v_out := regexp_replace(v_out, ' +([.,!?;:])', '\1', 'g');
  return v_out;
end;
$$;

