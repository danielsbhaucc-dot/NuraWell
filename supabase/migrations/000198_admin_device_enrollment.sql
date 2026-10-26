-- Hidden admin: one-time enrollment links (Gideon → Telegram), device binding to a passkey credential,
-- richer device facts for the devices list, aggregated probe counters for unenrolled hits. Additive only.
create table if not exists public.ops_device_enrollments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  issued_via text not null default 'telegram',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  device_id uuid references public.ops_trusted_devices(id) on delete set null,
  -- after the link is opened: browser-bound session secret (hash), then password + strong factor, then number match
  session_hash text,
  ip_hash text,
  label text not null default '',
  location text not null default '',
  factor_via text,
  factor_ok_at timestamptz,
  match_number smallint check (match_number between 10 and 99),
  match_sent_at timestamptz,
  match_expires_at timestamptz,
  match_decided_at timestamptz,
  match_result text check (match_result in ('approved','wrong','expired')),
  completed_at timestamptz
);
create index if not exists idx_ops_device_enrollments_user on public.ops_device_enrollments(user_id, created_at desc);

alter table public.ops_trusted_devices add column if not exists credential_id text;
alter table public.ops_trusted_devices add column if not exists public_key text;
alter table public.ops_trusted_devices add column if not exists sign_count bigint not null default 0;
alter table public.ops_trusted_devices add column if not exists last_ip_hash text;
alter table public.ops_trusted_devices add column if not exists last_ip_masked text;
alter table public.ops_trusted_devices add column if not exists last_country text;
alter table public.ops_trusted_devices add column if not exists browser text;
create unique index if not exists uq_ops_trusted_devices_credential on public.ops_trusted_devices(credential_id) where credential_id is not null;

-- Unenrolled hits on the admin host: one row per day × hashed IP, counter only (no paths, no UA).
create table if not exists public.ops_probe_daily (
  day date not null,
  ip_hash text not null,
  country text not null default '',
  hits int not null default 0,
  product_id text not null default 'nurawell',
  primary key (day, ip_hash)
);
create or replace function public.ops_probe_hit(p_ip_hash text, p_country text)
returns void language sql security definer set search_path = '' as $$
  insert into public.ops_probe_daily (day, ip_hash, country, hits) values ((now() at time zone 'utc')::date, left(p_ip_hash, 64), left(coalesce(p_country, ''), 2), 1)
  on conflict (day, ip_hash) do update set hits = public.ops_probe_daily.hits + 1;
$$;

-- Number-matching decision: single use, bound to this pending enrollment, short-lived; wrong number = revoke.
create or replace function public.ops_enroll_decide(p_id uuid, p_number int)
returns text language plpgsql security definer set search_path = '' as $$
declare r public.ops_device_enrollments%rowtype; begin
  select * into r from public.ops_device_enrollments where id = p_id for update;
  if not found then return 'not_found'; end if;
  if r.match_decided_at is not null or r.revoked_at is not null or r.completed_at is not null then return 'used'; end if;
  if r.factor_ok_at is null or r.match_number is null then return 'not_ready'; end if;
  if r.match_expires_at <= now() then
    update public.ops_device_enrollments set match_decided_at = now(), match_result = 'expired', revoked_at = now() where id = p_id;
    return 'expired';
  end if;
  if p_number <> r.match_number then
    update public.ops_device_enrollments set match_decided_at = now(), match_result = 'wrong', revoked_at = now() where id = p_id;
    return 'wrong';
  end if;
  update public.ops_device_enrollments set match_decided_at = now(), match_result = 'approved' where id = p_id;
  return 'approved';
end $$;
revoke all on function public.ops_enroll_decide(uuid, int) from public, anon, authenticated;
grant execute on function public.ops_enroll_decide(uuid, int) to service_role;

-- Atomic single-use claim of an enrollment link.
create or replace function public.ops_claim_enrollment(p_token_hash text, p_session_hash text default null, p_ip_hash text default null)
returns table (id uuid, user_id uuid) language sql security definer set search_path = '' as $$
  update public.ops_device_enrollments e set used_at = now(), session_hash = p_session_hash, ip_hash = p_ip_hash
   where e.token_hash = p_token_hash and e.used_at is null and e.revoked_at is null and e.expires_at > now()
  returning e.id, e.user_id;
$$;

do $$ declare t text; begin
  foreach t in array array['ops_device_enrollments','ops_probe_daily'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;
revoke all on function public.ops_probe_hit(text, text) from public, anon, authenticated;
revoke all on function public.ops_claim_enrollment(text, text, text) from public, anon, authenticated;
grant execute on function public.ops_probe_hit(text, text) to service_role;
grant execute on function public.ops_claim_enrollment(text, text, text) to service_role;

-- Temporary blocks after a wrong number / rejected enrollment (hashed IP, expiry).
create table if not exists public.ops_enroll_blocks (
  ip_hash text primary key,
  blocked_until timestamptz not null,
  reason text not null default ''
);
alter table public.ops_enroll_blocks enable row level security;
revoke all on public.ops_enroll_blocks from anon, authenticated;
