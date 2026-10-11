-- 000099: make duplicates impossible at the DB level (tasks, notifications, transcript requests).

-- ── shared text normalizer (whitespace/punctuation/emoji-insensitive, case-folded) ──
create or replace function public.dedupe_normalize(t text) returns text
language sql immutable parallel safe set search_path = pg_catalog as $$
  select lower(regexp_replace(regexp_replace(coalesce(t, ''), '[^[:alnum:]א-ת]+', ' ', 'g'), '\s+', ' ', 'g'))
$$;

-- ── TASKS: one active assignment per user per habit (normalized task title) ──
alter table public.user_task_assignments add column if not exists habit_dedupe_key text;

create or replace function public.uta_set_dedupe_key() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_key text; v_src text;
begin
  select md5(public.dedupe_normalize(d.title)), d.source into v_key, v_src from public.task_definitions d where d.id = new.definition_id;
  new.habit_dedupe_key := v_key;
  -- a second live copy of the same habit is archived instead of failing legacy writers
  if new.status in ('accepted','offered','paused') and exists (
    select 1 from public.user_task_assignments a
    where a.user_id = new.user_id and a.habit_dedupe_key = v_key and a.id <> new.id
      and a.status in ('accepted','offered','paused')
  ) then
    new.status := 'archived';
  end if;
  return new;
end $$;
revoke execute on function public.uta_set_dedupe_key() from public, anon, authenticated;
drop trigger if exists trg_uta_dedupe on public.user_task_assignments;
create trigger trg_uta_dedupe before insert or update of definition_id, status on public.user_task_assignments
  for each row execute function public.uta_set_dedupe_key();

-- backfill keys
update public.user_task_assignments a set habit_dedupe_key = md5(public.dedupe_normalize(d.title))
from public.task_definitions d where d.id = a.definition_id and a.habit_dedupe_key is null;

-- archive existing duplicate copies (no hard delete): keep step > guide > almog > ai_daily, main first, accepted first, oldest
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

-- ── NOTIFICATIONS: unique per user + type + dedupe_key + Israel day ──
alter table public.notifications add column if not exists dedupe_key text;
alter table public.notifications add column if not exists day_key date;

create or replace function public.notifications_set_dedupe() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  new.day_key := (coalesce(new.created_at, now()) at time zone 'Asia/Jerusalem')::date;
  if new.dedupe_key is null then
    -- caller idempotency key wins; else hash of purpose + normalized content
    new.dedupe_key := coalesce(nullif(new.metadata->>'idempotency_key', ''),
      md5(coalesce(new.metadata->>'source', '') || '|' || public.dedupe_normalize(new.title) || '|' || public.dedupe_normalize(new.body)));
  end if;
  return new;
end $$;
drop trigger if exists trg_notifications_dedupe on public.notifications;
create trigger trg_notifications_dedupe before insert on public.notifications
  for each row execute function public.notifications_set_dedupe();

-- old rows keep NULL keys (historic duplicates stay as history); every new row is covered
create unique index if not exists uq_notifications_dedupe_day
  on public.notifications (user_id, type, dedupe_key, day_key) where dedupe_key is not null;

-- ── TRANSCRIPT ACCESS: at most one pending request per user+session ──
update public.chat_transcript_access_requests r set status = 'cancelled', cancelled_at = now()
where r.status = 'pending' and exists (
  select 1 from public.chat_transcript_access_requests o
  where o.status = 'pending' and o.user_id = r.user_id and o.session_id is not distinct from r.session_id
    and (o.created_at > r.created_at or (o.created_at = r.created_at and o.id > r.id))
);
create unique index if not exists uq_transcript_one_pending
  on public.chat_transcript_access_requests (user_id, coalesce(session_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status = 'pending';
