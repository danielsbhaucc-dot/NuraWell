-- Distributed fixed-window rate limiter (used when Upstash Redis is not configured).
create table if not exists public.rate_limit_buckets (
  bucket_key text primary key,          -- sha256(namespace:key:window), never raw IP/user id
  count integer not null default 0,
  expires_at timestamptz not null
);
create index if not exists rate_limit_buckets_expires_idx on public.rate_limit_buckets (expires_at);
alter table public.rate_limit_buckets enable row level security;
revoke all on public.rate_limit_buckets from anon, authenticated;

create or replace function public.rate_limit_consume(p_key text, p_window_seconds integer)
returns table (hits integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  w bigint := floor(extract(epoch from now()) / greatest(p_window_seconds, 1));
  k text := encode(extensions.digest(p_key || ':' || p_window_seconds || ':' || w, 'sha256'), 'hex');
  r timestamptz := to_timestamp((w + 1) * greatest(p_window_seconds, 1));
begin
  insert into public.rate_limit_buckets as b (bucket_key, count, expires_at)
  values (k, 1, r)
  on conflict (bucket_key) do update set count = b.count + 1
  returning b.count, b.expires_at into hits, reset_at;
  -- opportunistic cleanup (~1% of calls)
  if random() < 0.01 then
    delete from public.rate_limit_buckets where expires_at < now() - interval '5 minutes';
  end if;
  return next;
end;
$$;
revoke all on function public.rate_limit_consume(text, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_consume(text, integer) to service_role;

-- daily cleanup if pg_cron exists
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('rate-limit-cleanup', '17 * * * *', $c$delete from public.rate_limit_buckets where expires_at < now() - interval '5 minutes'$c$);
  end if;
exception when others then null; end $$;
