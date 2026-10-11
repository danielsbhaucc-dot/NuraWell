-- 000100: dedupe_normalize must trim (trailing punctuation/space made equal texts differ). Re-key + re-archive.
create or replace function public.dedupe_normalize(t text) returns text
language sql immutable parallel safe set search_path = pg_catalog as $$
  select btrim(lower(regexp_replace(regexp_replace(coalesce(t, ''), '[^[:alnum:]א-ת]+', ' ', 'g'), '\s+', ' ', 'g')))
$$;
drop index if exists public.uq_uta_one_live_per_habit;
update public.user_task_assignments a set habit_dedupe_key = md5(public.dedupe_normalize(d.title))
from public.task_definitions d where d.id = a.definition_id;
with ranked as (
  select a.id, row_number() over (
    partition by a.user_id, a.habit_dedupe_key
    order by case d.source when 'step' then 0 when 'guide' then 1 when 'almog' then 2 when 'ai_daily' then 3 else 9 end,
             a.is_main desc, (a.status = 'accepted') desc, a.created_at
  ) rn
  from public.user_task_assignments a join public.task_definitions d on d.id = a.definition_id
  where a.status in ('accepted','offered','paused')
)
update public.user_task_assignments a set status = 'archived', updated_at = now()
from ranked r where r.id = a.id and r.rn > 1;
create unique index if not exists uq_uta_one_live_per_habit
  on public.user_task_assignments (user_id, habit_dedupe_key)
  where status in ('accepted','offered','paused');
