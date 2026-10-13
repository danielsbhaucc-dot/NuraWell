-- Central safety net: AI text must never be stored/shown with PII placeholders
-- ([PERSON_NAME], [[USER_FIRST_NAME]], [שם], [ADDRESS]...). Name placeholders are
-- restored to the user's first name; other PII placeholders are removed.
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
    '\[\[?\s*(PERSON_NAME|PERSON|USER_FIRST_NAME|USER_FULL_NAME|FIRST_NAME|FIRSTNAME|NAME|USER|שם)\s*\]\]?',
    coalesce(v_first, ''), 'gi');
  v_out := regexp_replace(
    v_out,
    '\[\[?\s*(ADDRESS|USER_ADDRESS|USER_PHONE|PHONE|USER_EMAIL|EMAIL|USER_ID|כתובת)\s*\]\]?',
    '', 'gi');
  v_out := regexp_replace(v_out, '[ \t]{2,}', ' ', 'g');
  v_out := regexp_replace(v_out, ' +([.,!?;:])', '\1', 'g');
  return v_out;
end;
$$;

revoke all on function public.restore_pii_placeholders(text, uuid) from public, anon, authenticated;

create or replace function public.trg_restore_pii_notifications()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.title := restore_pii_placeholders(new.title, new.user_id);
  new.body := restore_pii_placeholders(new.body, new.user_id);
  return new;
end; $$;

create or replace function public.trg_restore_pii_ai_interactions()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role = 'assistant' then
    new.content := restore_pii_placeholders(new.content, new.user_id);
  end if;
  return new;
end; $$;

create or replace function public.trg_restore_pii_chat_sessions()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.title := restore_pii_placeholders(new.title, new.user_id);
  new.summary := restore_pii_placeholders(new.summary, new.user_id);
  new.preview_text := restore_pii_placeholders(new.preview_text, new.user_id);
  return new;
end; $$;

create or replace function public.trg_restore_pii_periodic_summaries()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.ai_insight := restore_pii_placeholders(new.ai_insight, new.user_id);
  return new;
end; $$;

drop trigger if exists restore_pii_notifications on public.notifications;
create trigger restore_pii_notifications before insert or update of title, body on public.notifications
  for each row execute function public.trg_restore_pii_notifications();

drop trigger if exists restore_pii_ai_interactions on public.ai_interactions;
create trigger restore_pii_ai_interactions before insert or update of content on public.ai_interactions
  for each row execute function public.trg_restore_pii_ai_interactions();

drop trigger if exists restore_pii_chat_sessions on public.chat_sessions;
create trigger restore_pii_chat_sessions before insert or update of title, summary, preview_text on public.chat_sessions
  for each row execute function public.trg_restore_pii_chat_sessions();

drop trigger if exists restore_pii_periodic_summaries on public.chat_periodic_summaries;
create trigger restore_pii_periodic_summaries before insert or update of ai_insight on public.chat_periodic_summaries
  for each row execute function public.trg_restore_pii_periodic_summaries();

-- Backfill existing leaks (triggers fire on these updates).
update public.notifications set body = body
  where (title || ' ' || body) ~* '\[\[?\s*(PERSON_NAME|PERSON|USER_FIRST_NAME|USER_FULL_NAME|FIRST_NAME|NAME|ADDRESS|USER_ADDRESS|שם)\s*\]\]?';
update public.ai_interactions set content = content
  where role = 'assistant' and content ~* '\[\[?\s*(PERSON_NAME|PERSON|USER_FIRST_NAME|USER_FULL_NAME|FIRST_NAME|NAME|ADDRESS|USER_ADDRESS|שם)\s*\]\]?';
update public.chat_sessions set title = title
  where coalesce(title,'') || coalesce(summary,'') || coalesce(preview_text,'') ~* '\[\[?\s*(PERSON_NAME|PERSON|USER_FIRST_NAME|USER_FULL_NAME|FIRST_NAME|NAME|ADDRESS|USER_ADDRESS|שם)\s*\]\]?';
