-- Nightly merge v2: consolidate by BEHAVIOR (one water task, not three), using each task's origin to pick the ladder level.
--  * task_dup_candidates: broader free pre-filter (any shared stem ≥3 chars, or same habit / related habit / step) and
--    richer per-task context: origin (lesson step / Almog chat / daily AI), why it was created (reason, chat excerpt,
--    related habit, relation/parent), ladder levels, and recent level/merge history with reasons and dates.
--  * merge_task_assignments: optional p_level — set the kept task to that ladder level (clamped to floor/max)
--    instead of "keep the higher level", logs a level_change + a merged event with the reason.

create or replace function public.task_dup_candidates(p_limit int default 200)
returns table (user_id uuid, tasks jsonb)
language sql stable security definer set search_path to 'public' as $$
  with t as (
    select u.id, u.user_id, d.title, u.current_level, u.is_main, d.source, d.created_by, d.habit_key, d.step_id, d.ladder,
           d.floor_level, d.max_level, u.accepted_at, u.legacy_ref,
           array(select x from unnest(public.nw_title_tokens(d.title)) x where char_length(x) >= 3) tok,
           (select count(*) from public.task_events e where e.assignment_id = u.id and e.kind in ('done','partial')) done_n
    from public.user_task_assignments u join public.task_definitions d on d.id = u.definition_id
    where u.status = 'accepted'
  ),
  a as (
    select t.*, aa.reason a_reason, aa.source_excerpt, aa.related_habit_id, aa.related_step_id, aa.relation,
           aa.parent_assignment_id, aa.metadata->>'related_habit_title' related_habit_title
    from t left join public.almog_assignments aa on t.legacy_ref = aa.id::text
  ),
  pairs as (
    select x.user_id, x.id a_id, y.id b_id from a x join a y on x.user_id = y.user_id and x.id < y.id
    where x.tok && y.tok
       or (x.habit_key = y.habit_key and x.habit_key not like 'almog:%' and x.habit_key not like 'ai_daily:%')
       or (x.related_habit_id is not null and x.related_habit_id in (y.related_habit_id, y.habit_key))
       or (y.related_habit_id is not null and y.related_habit_id = x.habit_key)
       or (coalesce(x.step_id, x.related_step_id) is not null and coalesce(x.step_id, x.related_step_id) = coalesce(y.step_id, y.related_step_id))
  ),
  ids as (select user_id, a_id id from pairs union select user_id, b_id from pairs)
  select a.user_id, jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'id', a.id, 'title', a.title, 'level', a.current_level, 'main', a.is_main, 'source', a.source,
      'created_by', a.created_by, 'since', to_char(a.accepted_at at time zone 'Asia/Jerusalem', 'YYYY-MM-DD'), 'done', a.done_n,
      'habit', a.habit_key, 'why', left(a.a_reason, 120), 'chat_excerpt', left(a.source_excerpt, 160),
      'related_habit', a.related_habit_title, 'relation', nullif(a.relation, 'standalone'),
      'ladder', case when jsonb_typeof(a.ladder) = 'array' and jsonb_array_length(a.ladder) > 0
                     then (select jsonb_agg(jsonb_build_object('level', l->'level', 'title', l->'title')) from jsonb_array_elements(a.ladder) l) end,
      'history', (select jsonb_agg(h) from (
          select jsonb_strip_nulls(jsonb_build_object('kind', e.kind, 'from', e.from_level, 'to', e.to_level,
                   'reason', left(e.reason, 80), 'via', e.source, 'date', e.date_key)) h
          from public.task_events e
          where e.assignment_id = a.id and e.kind in ('level_change','merged','accepted') and coalesce(e.reason,'') not like 'e2e%'
          order by e.occurred_at desc limit 6) hh)
    )) order by a.is_main desc, a.done_n desc)
  from a join ids on ids.id = a.id
  group by a.user_id
  limit p_limit;
$$;

drop function if exists public.merge_task_assignments(uuid, uuid, uuid[], text);
create or replace function public.merge_task_assignments(p_user uuid, p_keep uuid, p_drop uuid[], p_reason text default null, p_level int default null)
returns int language plpgsql security definer set search_path to 'public' as $$
declare k record; n int; titles text[]; new_level int;
begin
  select u.*, d.title, d.floor_level, d.max_level, d.ladder into k from public.user_task_assignments u join public.task_definitions d on d.id = u.definition_id
  where u.id = p_keep and u.user_id = p_user and u.status = 'accepted' for update of u;
  if not found then raise exception 'keep task not found'; end if;
  p_drop := array(select x from unnest(p_drop) x where x <> p_keep);
  select count(*), array_agg(d.title) into n, titles from public.user_task_assignments u join public.task_definitions d on d.id = u.definition_id
  where u.id = any(p_drop) and u.user_id = p_user and u.status = 'accepted';
  if n is distinct from cardinality(p_drop) or n = 0 then raise exception 'drop tasks invalid'; end if;

  if p_level is not null then
    new_level := least(greatest(p_level, k.floor_level), k.max_level);
    -- an explicit ladder must contain the level
    if jsonb_typeof(k.ladder) = 'array' and jsonb_array_length(k.ladder) > 0
       and not exists (select 1 from jsonb_array_elements(k.ladder) l where (l->>'level')::int = new_level) then
      new_level := k.current_level;
    end if;
  else
    new_level := greatest(k.current_level, (select max(current_level) from public.user_task_assignments where id = any(p_drop)));
  end if;

  update public.user_task_assignments set
    current_level = new_level,
    last_level_change_at = case when new_level <> k.current_level then now() else last_level_change_at end,
    is_main = k.is_main or exists (select 1 from public.user_task_assignments where id = any(p_drop) and is_main),
    updated_at = now()
  where id = p_keep;
  update public.task_events set assignment_id = p_keep where assignment_id = any(p_drop);
  update public.user_task_assignments set status = 'archived', is_main = false, updated_at = now() where id = any(p_drop);
  update public.almog_assignments a set status = 'dropped',
    history = coalesce(case when jsonb_typeof(a.history) = 'array' then a.history end, '[]'::jsonb)
              || jsonb_build_array(jsonb_build_object('at', now(), 'action', 'dropped', 'note', 'אוחד לתוך המשימה "' || k.title || '"'))
  where a.user_id = p_user and a.status = 'active' and a.id::text in (select legacy_ref from public.user_task_assignments where id = any(p_drop) and legacy_ref is not null);

  if new_level <> k.current_level then
    insert into public.task_events (user_id, assignment_id, definition_id, kind, date_key, level, from_level, to_level, reason, source)
    values (p_user, p_keep, k.definition_id, 'level_change', to_char(now() at time zone 'Asia/Jerusalem', 'YYYY-MM-DD'),
            new_level, k.current_level, new_level, coalesce(p_reason, 'איחוד משימות'), 'almog_auto');
  end if;
  insert into public.task_events (user_id, assignment_id, definition_id, kind, date_key, level, from_level, to_level, reason, source, metadata)
  values (p_user, p_keep, k.definition_id, 'merged', to_char(now() at time zone 'Asia/Jerusalem', 'YYYY-MM-DD'),
          new_level, k.current_level, new_level, coalesce(p_reason, 'איחוד משימות על אותו הרגל'), 'almog_auto',
          jsonb_build_object('merged_ids', to_jsonb(p_drop), 'merged_titles', to_jsonb(titles), 'kept_title', k.title,
                             'requested_level', p_level, 'from_level', k.current_level, 'to_level', new_level));
  return n;
end $$;
revoke all on function public.task_dup_candidates(int), public.merge_task_assignments(uuid, uuid, uuid[], text, int) from public, anon, authenticated;
