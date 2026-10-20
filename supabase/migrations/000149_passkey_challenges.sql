-- Account passkey challenges get their own table (public.webauthn_challenges is Gideon's step-up store).
create table if not exists public.passkey_challenges (
  id uuid primary key default gen_random_uuid(),
  binding_hash text not null unique,           -- sha256 of the httpOnly cookie secret
  user_id uuid null references auth.users(id) on delete cascade,
  purpose text not null check (purpose in ('register', 'login')),
  challenge text not null,
  rp_id text not null,
  origin text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz null,
  created_at timestamptz not null default now()
);
create index if not exists passkey_challenges_expires_idx on public.passkey_challenges (expires_at);
alter table public.passkey_challenges enable row level security;
revoke all on public.passkey_challenges from anon, authenticated;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'webauthn-challenge-cleanup') then
      perform cron.unschedule('webauthn-challenge-cleanup');
    end if;
    perform cron.schedule('passkey-challenge-cleanup', '23 * * * *', $c$delete from public.passkey_challenges where expires_at < now() - interval '1 hour'$c$);
  end if;
end $$;
