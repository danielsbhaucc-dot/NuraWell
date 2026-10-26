-- Applied on prod 2026-10-26 with Daniel's approval (2 rows rewritten, 0 legacy keys remaining); idempotent re-run is a no-op.
--
-- Why: migration 000092 created ai_daily task_definitions with
--   stable_key = 'ai_daily:' || daily_action_instances.id      (id-based, fine)
--   habit_key  = 'ai_daily:' || coalesce(original_title, display_title)   <- the user's task TITLE in plaintext
-- task_definitions is on enc:v2 (FIELD_V2_TABLES): owned rows' title is sealed by the app and the backfill, so the
-- title must not survive in plaintext in habit_key/stable_key. Shared catalog rows (owner_user_id NULL) stay plaintext.
-- Current app writers already use id keys only; buildDupCandidates ignores habit_keys starting with ai_daily:
-- (dedupe runs on title_bidx), so grouping by these keys has no remaining reader.
--
-- Rewrite: habit_key := stable_key when stable_key is the id form; otherwise both := 'ai_daily:def:' || id.
-- Idempotent (only rows whose key is not an id key are touched). Prints counts only, never values.
--
-- Dry run (counts only):
--   select count(*) filter (where habit_key like 'ai_daily:%' and habit_key !~ '^ai_daily:(def:)?[0-9a-f-]{36}$') as habit_key_with_title,
--          count(*) filter (where stable_key like 'ai_daily:%' and stable_key !~ '^ai_daily:(def:)?[0-9a-f-]{36}$') as stable_key_not_id
--   from public.task_definitions where source = 'ai_daily' or habit_key like 'ai_daily:%' or stable_key like 'ai_daily:%';

begin;

update public.task_definitions d
   set stable_key = 'ai_daily:def:' || d.id::text, updated_at = now()
 where d.stable_key like 'ai_daily:%'
   and d.stable_key !~ '^ai_daily:(def:)?[0-9a-f-]{36}$';

update public.task_definitions d
   set habit_key = d.stable_key, updated_at = now()
 where d.habit_key like 'ai_daily:%'
   and d.habit_key !~ '^ai_daily:(def:)?[0-9a-f-]{36}$';

do $$
declare n int;
begin
  select count(*) into n from public.task_definitions
   where (habit_key like 'ai_daily:%' and habit_key !~ '^ai_daily:(def:)?[0-9a-f-]{36}$')
      or (stable_key like 'ai_daily:%' and stable_key !~ '^ai_daily:(def:)?[0-9a-f-]{36}$');
  if n <> 0 then raise exception 'ai_daily legacy keys remain: %', n; end if;
  raise notice 'ai_daily legacy keys: 0 remaining';
end $$;

commit;
