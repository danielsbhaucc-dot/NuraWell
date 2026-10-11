-- 000103: AI-generated task titles — fix malformed imperatives and hard cuts at every insert path (DB-level).
-- "שתות 2 כוסות" (not a word; model tried a gendered imperative) → neutral infinitive "לשתות ...".
-- Titles hard-cut at exactly 60 chars mid-word ("...וראש ע") → drop the partial word, add "…".
create or replace function public.normalize_task_title(t text) returns text
language plpgsql immutable set search_path = pg_catalog as $$
declare s text := btrim(coalesce(t, ''));
begin
  s := regexp_replace(s, '^(שתות|שתה|שתי)(\s)', 'לשתות\2');
  s := regexp_replace(s, '^(אכול|אכלי)(\s)', 'לאכול\2');
  if char_length(s) = 60 and s !~ '[.!?…)]$' and position(' ' in s) > 0 then
    s := regexp_replace(s, '\s+\S*$', '') || '…';
  end if;
  return s;
end $$;

create or replace function public.task_title_normalize_trg() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  new.title := public.normalize_task_title(new.title);
  return new;
end $$;
revoke execute on function public.task_title_normalize_trg() from public, anon, authenticated;

drop trigger if exists trg_task_definitions_title on public.task_definitions;
create trigger trg_task_definitions_title before insert or update of title on public.task_definitions
  for each row execute function public.task_title_normalize_trg();
drop trigger if exists trg_almog_assignments_title on public.almog_assignments;
create trigger trg_almog_assignments_title before insert or update of title on public.almog_assignments
  for each row execute function public.task_title_normalize_trg();

update public.task_definitions set title = title where title <> public.normalize_task_title(title);
update public.almog_assignments set title = title where title <> public.normalize_task_title(title);
