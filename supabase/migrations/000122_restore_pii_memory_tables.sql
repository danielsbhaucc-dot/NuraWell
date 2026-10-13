-- Extend 000121: memory/insight tables also never keep raw AI placeholders ([[USER_*]], [PERSON_NAME], ...).
-- Policy: stored text holds real (restored) values, same as everything shown to the user.
create or replace function public.trg_restore_pii_generic()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  col text;
  v text;
begin
  foreach col in array tg_argv loop
    execute format('select ($1).%I::text', col) into v using new;
    if v is not null and v ~ '\[' then
      new := jsonb_populate_record(new, jsonb_build_object(col, restore_pii_placeholders(v, new.user_id)));
    end if;
  end loop;
  return new;
end $$;

drop trigger if exists restore_pii_periodic_summaries_v2 on public.periodic_summaries;
create trigger restore_pii_periodic_summaries_v2 before insert or update on public.periodic_summaries
  for each row execute function public.trg_restore_pii_generic('ai_insight');
drop trigger if exists restore_pii_user_insights on public.user_insights;
create trigger restore_pii_user_insights before insert or update on public.user_insights
  for each row execute function public.trg_restore_pii_generic('insight_text');
drop trigger if exists restore_pii_user_memories on public.user_memories;
create trigger restore_pii_user_memories before insert or update on public.user_memories
  for each row execute function public.trg_restore_pii_generic('memory_text');
drop trigger if exists restore_pii_mentorship on public.user_mentorship_strategy;
create trigger restore_pii_mentorship before insert or update on public.user_mentorship_strategy
  for each row execute function public.trg_restore_pii_generic('psychological_approach', 'next_best_action');

-- backfill (the triggers rewrite on update)
update public.periodic_summaries set ai_insight = ai_insight where ai_insight ~ '\[';
update public.user_insights set insight_text = insight_text where insight_text ~ '\[';
update public.user_memories set memory_text = memory_text where memory_text ~ '\[';
update public.user_mentorship_strategy set psychological_approach = psychological_approach
  where coalesce(psychological_approach, '') || coalesce(next_best_action, '') ~ '\[';
