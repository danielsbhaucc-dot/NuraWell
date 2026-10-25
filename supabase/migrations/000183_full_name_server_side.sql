-- round-4 security: profiles.full_name moves to app-side encryption.
-- 1) Signup trigger no longer copies the plaintext name from auth metadata; the server action
--    (lib/actions/complete-onboarding.ts) writes full_name through sealProfilePatch right after createUser.
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    INSERT INTO public.profiles (id, role) VALUES (NEW.id, 'user');
    RETURN NEW;
END;
$function$;

-- 2) Name placeholders are restored in the app before encryption (lib/crypto/pii-seal.ts,
--    lib/ai/insert-ai-interaction.ts). The SQL fallback must never splice ciphertext into text:
--    an encrypted full_name (enc:...) is treated as unknown and the token is dropped.
CREATE OR REPLACE FUNCTION public.restore_pii_placeholders(p_text text, p_user_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_first text;
  v_out text;
begin
  if p_text is null or p_text !~ '\[' then
    return p_text;
  end if;
  if p_user_id is not null then
    select case when full_name like 'enc:%' then null
                else nullif(split_part(btrim(coalesce(full_name, '')), ' ', 1), '') end
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
$function$;
