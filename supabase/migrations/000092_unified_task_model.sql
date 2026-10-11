-- 000092: ONE task model — definitions (stable ids + difficulty ladder), user assignments, events.
-- Data-preserving: legacy tables stay; existing rows are copied and legacy writers are mirrored by triggers.

create table if not exists public.task_definitions (
  id uuid primary key default gen_random_uuid(),
  stable_key text not null unique,               -- e.g. step:<step_id>:<task_id>, almog:<assignment_id>
  source text not null check (source in ('step','almog','ai_daily','challenge','guide')),
  source_ref text,
  step_id uuid references public.journey_steps(id) on delete set null,
  habit_key text not null,                       -- groups ladder levels of the same habit
  title text not null,
  description text,
  emoji text,
  schedule text,
  times_per_day int,
  -- ladder: [{ "level": int, "title": text, "times_per_day": int|null }]; level 0 = original target,
  -- negative = easier, positive = harder. floor_level = easiest allowed (never meaningless).
  ladder jsonb not null default '[]'::jsonb,
  floor_level int not null default -2 check (floor_level <= 0),
  max_level int not null default 0 check (max_level >= 0),
  created_by text not null default 'system',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_task_definitions_step on public.task_definitions(step_id);
create index if not exists idx_task_definitions_habit on public.task_definitions(habit_key);

create table if not exists public.user_task_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  definition_id uuid not null references public.task_definitions(id) on delete cascade,
  status text not null default 'offered' check (status in ('offered','accepted','declined','paused','completed','archived')),
  is_main boolean not null default false,
  current_level int not null default 0,
  original_level int not null default 0,
  offered_at timestamptz not null default now(),
  accepted_at timestamptz,
  last_level_change_at timestamptz,
  legacy_ref text,                               -- e.g. almog_assignments.id
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, definition_id)
);
create index if not exists idx_uta_user_status on public.user_task_assignments(user_id, status);
create index if not exists idx_uta_definition on public.user_task_assignments(definition_id);

create table if not exists public.task_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  assignment_id uuid references public.user_task_assignments(id) on delete cascade,
  definition_id uuid references public.task_definitions(id) on delete cascade,
  kind text not null check (kind in ('done','partial','missed','skipped','level_change','accepted','declined')),
  date_key text,                                 -- YYYY-MM-DD in Asia/Jerusalem
  slot text,
  level int,
  from_level int,
  to_level int,
  reason text,
  source text not null default 'app',
  legacy_ref text unique,                        -- e.g. jte:<journey_task_executions.id>
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists idx_task_events_user_date on public.task_events(user_id, date_key);
create index if not exists idx_task_events_assignment on public.task_events(assignment_id, occurred_at desc);
create index if not exists idx_task_events_definition on public.task_events(definition_id);

alter table public.task_definitions enable row level security;
alter table public.user_task_assignments enable row level security;
alter table public.task_events enable row level security;
create policy task_definitions_read on public.task_definitions for select to authenticated using (true);
create policy uta_select_own on public.user_task_assignments for select to authenticated using (user_id = (select auth.uid()));
create policy task_events_select_own on public.task_events for select to authenticated using (user_id = (select auth.uid()));
-- writes go through server routes (service role) so ladder rules can't be bypassed.

-- ── streak: consecutive Israel days with ≥1 done/partial, ending today or yesterday ──
create or replace function public.recompute_streak_days(p_user uuid) returns int
language sql stable set search_path = public, pg_temp as $$
  with days as (
    select distinct date_key::date d from public.task_events
    where user_id = p_user and kind in ('done','partial') and date_key ~ '^\d{4}-\d{2}-\d{2}$'
  ), today as (select (now() at time zone 'Asia/Jerusalem')::date t),
  anchored as (
    select d, row_number() over (order by d desc) rn from days
  )
  select coalesce((
    select count(*)::int from anchored, today
    where d = (select max(d) from days) - (rn - 1)::int
      and (select max(d) from days) >= t - 1
  ), 0);
$$;

create or replace function public.task_events_update_streak() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.kind in ('done','partial') then
    update public.profiles set streak_days = public.recompute_streak_days(new.user_id) where id = new.user_id;
  end if;
  return new;
end $$;
revoke execute on function public.task_events_update_streak() from public, anon, authenticated;
drop trigger if exists trg_task_events_streak on public.task_events;
create trigger trg_task_events_streak after insert on public.task_events
  for each row execute function public.task_events_update_streak();

-- ── ensure definition + assignment for a step task (used by backfill and the legacy mirror) ──
create or replace function public.ensure_step_task_assignment(p_user uuid, p_step uuid, p_task text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_def uuid; v_asg uuid; t jsonb;
begin
  select x into t from public.journey_steps s, jsonb_array_elements(coalesce(s.tasks,'[]'::jsonb)) x
   where s.id = p_step and x->>'id' = p_task limit 1;
  insert into public.task_definitions (stable_key, source, source_ref, step_id, habit_key, title, description, emoji, schedule, times_per_day)
  values ('step:'||p_step||':'||p_task, 'step', p_task, p_step, 'step:'||p_step||':'||p_task,
          coalesce(t->>'title', p_task), t->>'description', t->>'emoji', t->>'schedule', nullif(t->>'times_per_day','')::int)
  on conflict (stable_key) do update set updated_at = now()
  returning id into v_def;
  insert into public.user_task_assignments (user_id, definition_id, status, is_main, accepted_at)
  values (p_user, v_def, 'accepted', true, now())
  on conflict (user_id, definition_id) do update set updated_at = now()
  returning id into v_asg;
  return v_asg;
end $$;
revoke execute on function public.ensure_step_task_assignment(uuid, uuid, text) from public, anon, authenticated;

-- mirror legacy journey_task_executions writes into task_events
create or replace function public.mirror_jte_to_task_events() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_asg uuid; v_def uuid;
begin
  v_asg := public.ensure_step_task_assignment(new.user_id, new.step_id, new.task_id);
  select definition_id into v_def from public.user_task_assignments where id = v_asg;
  insert into public.task_events (user_id, assignment_id, definition_id, kind, date_key, slot, level, source, legacy_ref, occurred_at, metadata)
  values (new.user_id, v_asg, v_def,
          case coalesce(new.outcome,'completed') when 'completed' then 'done' when 'partial' then 'partial'
               when 'attempt_failed' then 'missed' else 'skipped' end,
          new.date_key, new.slot,
          (select current_level from public.user_task_assignments where id = v_asg),
          coalesce(new.source,'legacy'), 'jte:'||new.id, coalesce(new.completed_at, now()),
          jsonb_build_object('note', new.note))
  on conflict (legacy_ref) do nothing;
  return new;
end $$;
revoke execute on function public.mirror_jte_to_task_events() from public, anon, authenticated;
drop trigger if exists trg_mirror_jte on public.journey_task_executions;
create trigger trg_mirror_jte after insert on public.journey_task_executions
  for each row execute function public.mirror_jte_to_task_events();

-- ── backfill ─────────────────────────────────────────────────────────────
-- step tasks (definitions for every published step task, even if nobody accepted yet)
insert into public.task_definitions (stable_key, source, source_ref, step_id, habit_key, title, description, emoji, schedule, times_per_day)
select 'step:'||s.id||':'||(x->>'id'), 'step', x->>'id', s.id, 'step:'||s.id||':'||(x->>'id'),
       coalesce(x->>'title',''), x->>'description', x->>'emoji', x->>'schedule', nullif(x->>'times_per_day','')::int
from public.journey_steps s, jsonb_array_elements(coalesce(s.tasks,'[]'::jsonb)) x
where x->>'id' is not null
on conflict (stable_key) do nothing;

-- executions → events (trigger logic, applied to existing rows)
do $$ declare r record; begin
  for r in select * from public.journey_task_executions loop
    declare v_asg uuid; v_def uuid; begin
      v_asg := public.ensure_step_task_assignment(r.user_id, r.step_id, r.task_id);
      select definition_id into v_def from public.user_task_assignments where id = v_asg;
      insert into public.task_events (user_id, assignment_id, definition_id, kind, date_key, slot, level, source, legacy_ref, occurred_at, metadata)
      values (r.user_id, v_asg, v_def,
              case coalesce(r.outcome,'completed') when 'completed' then 'done' when 'partial' then 'partial'
                   when 'attempt_failed' then 'missed' else 'skipped' end,
              r.date_key, r.slot, 0, coalesce(r.source,'legacy'), 'jte:'||r.id, coalesce(r.completed_at, now()),
              jsonb_build_object('note', r.note))
      on conflict (legacy_ref) do nothing;
    end;
  end loop;
end $$;

-- almog assignments → definitions + assignments
insert into public.task_definitions (stable_key, source, source_ref, step_id, habit_key, title, description, schedule, created_by)
select 'almog:'||a.id, 'almog', a.id::text, a.related_step_id,
       coalesce(nullif(a.related_habit_id,''), 'almog:'||a.id), a.title, a.detail, a.schedule, coalesce(a.created_by,'almog')
from public.almog_assignments a
on conflict (stable_key) do nothing;
insert into public.user_task_assignments (user_id, definition_id, status, is_main, accepted_at, legacy_ref, offered_at)
select a.user_id, d.id,
       case a.status when 'done' then 'completed' when 'completed' then 'completed' when 'dropped' then 'archived'
                     when 'cancelled' then 'archived' when 'proposed' then 'offered' when 'declined' then 'declined'
                     when 'paused' then 'paused' when 'frozen' then 'paused' else 'accepted' end,
       false, case when a.status in ('proposed','declined') then null else a.given_at end, a.id::text, a.given_at
from public.almog_assignments a join public.task_definitions d on d.stable_key = 'almog:'||a.id
on conflict (user_id, definition_id) do nothing;

-- daily action instances → ai_daily definitions + events
insert into public.task_definitions (stable_key, source, source_ref, habit_key, title, created_by)
select 'ai_daily:'||i.id, 'ai_daily', i.id::text, 'ai_daily:'||coalesce(i.original_title, i.display_title), i.display_title, 'orchestrator'
from public.daily_action_instances i
on conflict (stable_key) do nothing;
insert into public.user_task_assignments (user_id, definition_id, status, accepted_at, legacy_ref)
select i.user_id, d.id, 'accepted', i.created_at, i.id::text
from public.daily_action_instances i join public.task_definitions d on d.stable_key = 'ai_daily:'||i.id
on conflict (user_id, definition_id) do nothing;
insert into public.task_events (user_id, assignment_id, definition_id, kind, date_key, source, legacy_ref, occurred_at)
select i.user_id, u.id, u.definition_id,
       case i.status when 'completed' then 'done' when 'done' then 'done' when 'skipped' then 'skipped' else 'missed' end,
       i.date_key, 'legacy', 'dai:'||i.id, coalesce(i.completed_at, i.updated_at)
from public.daily_action_instances i
join public.user_task_assignments u on u.legacy_ref = i.id::text
where i.status in ('completed','done','skipped','missed')
on conflict (legacy_ref) do nothing;

-- explicit ladder for the existing water habit (others get a derived default ladder in lib/tasks/ladder.ts)
update public.task_definitions set
  ladder = '[{"level":-2,"title":"כוס מים אחת לפני ארוחה אחת ביום","times_per_day":1},
             {"level":-1,"title":"כוס מים אחת לפני כל ארוחה","times_per_day":3},
             {"level":0,"title":"שתיית 2 כוסות מים לפני הארוחה","times_per_day":3}]'::jsonb,
  floor_level = -2, max_level = 0
where stable_key = 'step:a1b2c3d4-e5f6-7890-abcd-ef1234567890:t1' and ladder = '[]'::jsonb;

-- recompute streaks for everyone with events
update public.profiles p set streak_days = public.recompute_streak_days(p.id)
where exists (select 1 from public.task_events e where e.user_id = p.id);
