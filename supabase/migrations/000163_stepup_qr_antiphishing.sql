-- Cross-device (QR → phone) approval for everyone: ops step-up, user step-up, and passwordless login.
-- Anti-phishing: number match, requester device/city/time shown on phone, "זה לא אני" cancel, TTL ≤ 2 min.
alter table public.stepup_requests alter column user_id drop not null;          -- login: unknown until the phone approves
alter table public.stepup_requests add column if not exists kind text not null default 'ops' check (kind in ('ops','user','login'));
alter table public.stepup_requests add column if not exists match_code text check (match_code ~ '^[0-9]{2}$');
alter table public.stepup_requests add column if not exists requester_city text;
alter table public.stepup_requests add column if not exists requester_ip_hash text;
alter table public.stepup_requests add column if not exists requester_session_hash text; -- sha256 of the requesting auth session id (null for login)
alter table public.stepup_requests add column if not exists match_failures int not null default 0;
alter table public.stepup_requests alter column expires_at set default now() + interval '2 minutes';
alter table public.stepup_requests drop constraint if exists stepup_requests_status_check;
alter table public.stepup_requests add constraint stepup_requests_status_check check (status in ('pending','approved','denied','consumed','expired','reported'));
alter table public.stepup_requests drop constraint if exists stepup_requests_method_check;
alter table public.stepup_requests add constraint stepup_requests_method_check check (method in ('phone_passkey','passkey','totp','backup_code'));
alter table public.stepup_requests add constraint stepup_requests_ttl check (expires_at <= created_at + interval '2 minutes 5 seconds') not valid;
create index if not exists stepup_requests_ip_idx on public.stepup_requests (requester_ip_hash, created_at desc);
