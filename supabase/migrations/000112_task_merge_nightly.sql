-- Why #102 missed duplicates:
--  1. The plan reads user_task_assignments (UTA); the guard + cleanup only touched almog_assignments, so UTA mirrors of
--     dropped Almog tasks stayed 'accepted' (the user still saw them).
--  2. The guard is lexical (Hebrew-stem overlap ≥ 0.72) and exempts 'eases' rows, so rewordings of the same habit
--     ("לשים 2 כוסות מים ליד הצלחת" / "לשתות 2 כוסות מים לפני ארוחה") pass. Meaning-level merges are done nightly.

alter table public.task_events drop constraint if exists task_events_kind_check;
alter table public.task_events add constraint task_events_kind_check
  check (kind in ('done','partial','missed','skipped','level_change','accepted','declined','merged'));

-- Keep UTA in sync when an Almog task leaves 'active' (single source for the plan).
create or replace function public.almog_assignment_sync_uta_trg()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.status is distinct from old.status and new.status <> 'active' then
    update public.user_task_assignments set status = 'archived', updated_at = now()
    where legacy_ref = new.id::text and user_id = new.user_id and status in ('accepted','offered','paused');
  end if;
  return new;
end $$;
drop trigger if exists trg_almog_assignments_sync_uta on public.almog_assignments;
create trigger trg_almog_assignments_sync_uta after update of status on public.almog_assignments
  for each row execute function public.almog_assignment_sync_uta_trg();

-- One-time: archive UTA rows whose Almog source is no longer active (the leftovers from the #102 cleanup).
update public.user_task_assignments u set status = 'archived', updated_at = now()
from public.almog_assignments a
where u.legacy_ref = a.id::text and a.status <> 'active' and u.status in ('accepted','offered','paused');

-- Free SQL pre-filter: users with likely-duplicate live tasks (shared stems ≥ 2 and ≥ 50% of the shorter title).
create or replace function public.task_dup_candidates(p_limit int default 200)
returns table (user_id uuid, tasks jsonb)
language sql stable security definer set search_path to 'public' as $$
  with t as (
    select u.id, u.user_id, d.title, u.current_level, u.is_main, d.source, u.accepted_at,
           public.nw_title_tokens(d.title) tok,
           (select count(*) from public.task_events e where e.assignment_id = u.id and e.kind in ('done','partial')) done_n
    from public.user_task_assignments u join public.task_definitions d on d.id = u.definition_id
    where u.status = 'accepted'
  ),
  pairs as (
    select a.user_id, a.id a_id, b.id b_id from t a join t b on a.user_id = b.user_id and a.id < b.id
    where (select count(*) from unnest(a.tok) x where x = any(b.tok)) >= 2
      and (select count(*) from unnest(a.tok) x where x = any(b.tok))::numeric / greatest(1, least(cardinality(a.tok), cardinality(b.tok))) >= 0.5
  ),
  ids as (select user_id, a_id id from pairs union select user_id, b_id from pairs)
  select t.user_id, jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'level', t.current_level, 'main', t.is_main, 'source', t.source, 'done', t.done_n) order by t.done_n desc)
  from t join ids on ids.id = t.id
  group by t.user_id
  limit p_limit;
$$;

-- Single write path for a merge: atomic, keeps the higher level + progress, moves history, logs a 'merged' event.
create or replace function public.merge_task_assignments(p_user uuid, p_keep uuid, p_drop uuid[], p_reason text default null)
returns int language plpgsql security definer set search_path to 'public' as $$
declare k record; n int; titles text[];
begin
  select u.*, d.title into k from public.user_task_assignments u join public.task_definitions d on d.id = u.definition_id
  where u.id = p_keep and u.user_id = p_user and u.status = 'accepted' for update of u;
  if not found then raise exception 'keep task not found'; end if;
  p_drop := array(select x from unnest(p_drop) x where x <> p_keep);
  select count(*), array_agg(d.title) into n, titles from public.user_task_assignments u join public.task_definitions d on d.id = u.definition_id
  where u.id = any(p_drop) and u.user_id = p_user and u.status = 'accepted';
  if n is distinct from cardinality(p_drop) or n = 0 then raise exception 'drop tasks invalid'; end if;

  update public.user_task_assignments set
    current_level = greatest(k.current_level, (select max(current_level) from public.user_task_assignments where id = any(p_drop))),
    original_level = greatest(k.original_level, (select max(original_level) from public.user_task_assignments where id = any(p_drop))),
    is_main = k.is_main or exists (select 1 from public.user_task_assignments where id = any(p_drop) and is_main),
    updated_at = now()
  where id = p_keep;
  update public.task_events set assignment_id = p_keep where assignment_id = any(p_drop);
  update public.user_task_assignments set status = 'archived', is_main = false, updated_at = now() where id = any(p_drop);
  update public.almog_assignments a set status = 'dropped',
    history = coalesce(case when jsonb_typeof(a.history) = 'array' then a.history end, '[]'::jsonb)
              || jsonb_build_array(jsonb_build_object('at', now(), 'action', 'dropped', 'note', 'אוחד עם משימה זהה'))
  where a.user_id = p_user and a.status = 'active' and a.id::text in (select legacy_ref from public.user_task_assignments where id = any(p_drop) and legacy_ref is not null);

  insert into public.task_events (user_id, assignment_id, definition_id, kind, date_key, level, reason, source, metadata)
  values (p_user, p_keep, k.definition_id, 'merged', to_char(now() at time zone 'Asia/Jerusalem', 'YYYY-MM-DD'),
          (select current_level from public.user_task_assignments where id = p_keep),
          coalesce(p_reason, 'איחוד משימות כמעט זהות'), 'almog_auto',
          jsonb_build_object('merged_ids', to_jsonb(p_drop), 'merged_titles', to_jsonb(titles), 'kept_title', k.title));
  return n;
end $$;
revoke all on function public.task_dup_candidates(int), public.merge_task_assignments(uuid, uuid, uuid[], text) from public, anon, authenticated;
