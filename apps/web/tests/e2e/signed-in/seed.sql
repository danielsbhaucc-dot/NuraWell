-- Idempotent seed/reset for the dedicated e2e account (role='test'). Safe to re-run before each CI run.
with u as (select p.id from public.profiles p join auth.users a on a.id = p.id where a.email = 'e2e-test@nurawell.test' and p.role = 'test'),
d as (select id from public.task_definitions where jsonb_array_length(ladder) >= 2 and floor_level <= -1 order by created_at limit 1),
del_e as (delete from public.task_events where user_id in (select id from u)),
del_a as (delete from public.user_task_assignments where user_id in (select id from u))
select 1;
insert into public.user_task_assignments (user_id, definition_id, status, is_main, current_level, original_level, accepted_at)
select u.id, d.id, 'accepted', true, 0, 0, now()
from (select p.id from public.profiles p join auth.users a on a.id = p.id where a.email = 'e2e-test@nurawell.test' and p.role = 'test') u,
     (select id from public.task_definitions where jsonb_array_length(ladder) >= 2 and floor_level <= -1 order by created_at limit 1) d;
select a.status, a.current_level, d.title from public.user_task_assignments a join public.task_definitions d on d.id = a.definition_id
join auth.users u on u.id = a.user_id where u.email = 'e2e-test@nurawell.test';
