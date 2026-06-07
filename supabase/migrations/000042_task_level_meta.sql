-- task_level_meta: state פר משתמש לרמות קושי של משימות
alter table journey_progress
  add column if not exists task_level_meta jsonb not null default '{}'::jsonb;

comment on column journey_progress.task_level_meta is
  'Per-task difficulty level state keyed by task_id (JourneyTaskLevelMeta JSON)';
