-- task_definitions owner split (sec/enc-close-pending).
-- Curriculum rows (source step/challenge/guide) are shared templates: owner_user_id IS NULL.
-- Per-user rows (almog:<assignment id>, ai_daily:<instance id>) now carry their owner, so
--   (a) RLS no longer exposes one user's habit titles to every authenticated user (was `using (true)`), and
--   (b) the rows become eligible for per-user encryption once the SQL title readers move to the app
--       (normalize_task_title trigger, habit_dedupe_key, merge/dup functions — see ENCRYPTION_ENFORCEMENT.he.md).
alter table public.task_definitions add column if not exists owner_user_id uuid references auth.users(id) on delete cascade;
create index if not exists idx_task_definitions_owner on public.task_definitions (owner_user_id) where owner_user_id is not null;

update public.task_definitions d set owner_user_id = a.user_id
from public.almog_assignments a
where d.owner_user_id is null and d.source = 'almog' and d.stable_key = 'almog:' || a.id::text;

update public.task_definitions d set owner_user_id = i.user_id
from public.daily_action_instances i
where d.owner_user_id is null and d.source = 'ai_daily' and d.stable_key = 'ai_daily:' || i.id::text;

-- fallback: any remaining user-sourced row is owned by the single user assigned to it
update public.task_definitions d set owner_user_id = u.user_id
from (select definition_id, min(user_id::text)::uuid as user_id, count(distinct user_id) as n
      from public.user_task_assignments group by definition_id) u
where d.owner_user_id is null and d.source in ('almog','ai_daily') and u.definition_id = d.id and u.n = 1;

drop policy if exists task_definitions_read on public.task_definitions;
create policy task_definitions_read on public.task_definitions for select to authenticated
  using (owner_user_id is null or owner_user_id = (select auth.uid()));
