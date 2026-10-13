-- which network path the writer request took: relay_iad1 (edge relay) or direct
alter table public.chat_perf_timings add column if not exists llm_path text;
