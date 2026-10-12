-- task_dup_candidates: expose schedule so the nightly merge can fold one-time tasks into the recurring task of the same behavior.
create or replace function public.task_dup_candidates(p_limit int default 200)
returns table (user_id uuid, tasks jsonb)
language sql stable security definer set search_path to 'public' as $$
  with t as (
    select u.id, u.user_id, d.title, u.current_level, u.is_main, d.source, d.created_by, d.habit_key, d.step_id, d.ladder,
           d.floor_level, d.max_level, d.schedule, u.accepted_at, u.legacy_ref,
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
      'habit', a.habit_key, 'schedule', a.schedule, 'why', left(a.a_reason, 120), 'chat_excerpt', left(a.source_excerpt, 160),
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

