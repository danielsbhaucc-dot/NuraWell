-- 000094: persisted chat perf timings (no PII: no user id, no text).
-- Retention 30 days: master cron deletes old rows (pg_cron block below runs only if the extension exists).
create table if not exists public.chat_perf_timings (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  writer text,
  model text,
  router_ms int,
  context_ms int,
  writer_open_ms int,
  ttft_ms int,
  total_ms int,
  heavy_context boolean,
  router_skipped boolean,
  router_fallback boolean,
  aborted boolean
);
create index if not exists idx_chat_perf_timings_created on public.chat_perf_timings(created_at desc);
alter table public.chat_perf_timings enable row level security;
-- no policies: service role writes; admins read via server routes / SQL.

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'chat_perf_timings_retention';
    perform cron.schedule('chat_perf_timings_retention', '17 3 * * *',
      $q$delete from public.chat_perf_timings where created_at < now() - interval '30 days'$q$);
  end if;
end $$;
