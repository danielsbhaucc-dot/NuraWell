-- 000187: subscription-based retention of personal data.
-- * The user's choice of what happens when the subscription ends is a consent record
--   (user_consents -> consent_history, 7-year legal class). consent_history gains a whitelisted
--   `choice` column so the decision survives account deletion as evidence.
-- * profiles.post_sub_retention caches the current choice (NULL = not chosen yet = treated as 'keep_24m').
-- * subscriptions.ended_at: when access actually ended. Set by the billing service / payment webhook,
--   by the nightly expiry, or manually by an admin. Resubscribing (a newer active row) cancels any deletion.
-- * retention_purge_due(): read-only candidate list for the nightly job (latest subscription per user only).
-- No existing user data is modified except an additive backfill of ended_at on already-expired rows.

alter table public.user_consents drop constraint if exists user_consents_type_check;
alter table public.user_consents add constraint user_consents_type_check check (
  consent_type in (
    'terms','privacy','health_data','parental_guardian','age_declaration','marketing',
    'push_notifications','guardian_opt_in','admin_transcript_access','post_subscription_retention'
  )
);

alter table public.consent_history add column if not exists choice text;
alter table public.consent_history drop constraint if exists consent_history_choice_check;
alter table public.consent_history add constraint consent_history_choice_check
  check (choice is null or choice in ('delete_now','keep_24m'));

create or replace function public.trg_user_consents_to_history()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.consent_history (source_consent_id, user_id, consent_type, granted, policy_version, source, evidence_id, request_id, created_at, choice)
  values (
    new.id, new.user_id, new.consent_type, new.granted, new.policy_version, left(new.source, 64),
    case when (new.metadata->>'evidence_id') ~ '^[0-9a-f-]{36}$' then (new.metadata->>'evidence_id')::uuid end,
    left(new.metadata->>'request_id', 120),
    new.created_at,
    case when new.metadata->>'choice' in ('delete_now','keep_24m') then new.metadata->>'choice' end
  )
  on conflict (source_consent_id) do nothing;
  return new;
end $$;
revoke all on function public.trg_user_consents_to_history() from public, anon, authenticated;

alter table public.profiles add column if not exists post_sub_retention text;
alter table public.profiles drop constraint if exists profiles_post_sub_retention_check;
alter table public.profiles add constraint profiles_post_sub_retention_check
  check (post_sub_retention is null or post_sub_retention in ('delete_now','keep_24m'));
alter table public.profiles add column if not exists post_sub_retention_at timestamptz;
comment on column public.profiles.post_sub_retention is
  'מה קורה למידע כשהמנוי נגמר: delete_now / keep_24m. NULL = לא נבחר (ברירת מחדל: keep_24m). הראיה: user_consents/consent_history';

alter table public.subscriptions add column if not exists ended_at timestamptz;
comment on column public.subscriptions.ended_at is 'מתי הגישה הסתיימה בפועל (webhook תשלום / תפוגה לילית / מנהל)';
update public.subscriptions
   set ended_at = coalesce(case when trial_ends_at is not null and current_period_end is null then trial_ends_at end, current_period_end, updated_at)
 where status = 'expired' and ended_at is null;
create index if not exists idx_subscriptions_ended on public.subscriptions(ended_at) where status = 'expired';

-- one 30-day reminder per subscription
drop index if exists public.uq_billing_events_notice;
create unique index if not exists uq_billing_events_notice on public.billing_events(subscription_id, kind)
  where kind in ('trial_ending_notice','expiring_notice','retention_purge_notice');

-- Candidates: users whose LATEST subscription is expired with ended_at set. Admins never.
create or replace function public.retention_purge_due(p_limit int default 200)
returns table (user_id uuid, subscription_id uuid, ended_at timestamptz, choice text, role text, reminder_sent boolean)
language sql stable security definer set search_path = public, pg_temp as $$
  with latest as (
    select distinct on (s.user_id) s.user_id, s.id, s.status, s.ended_at
      from public.subscriptions s
     order by s.user_id, s.created_at desc
  )
  select l.user_id, l.id, l.ended_at, coalesce(p.post_sub_retention, 'keep_24m'), p.role,
         exists (select 1 from public.billing_events b where b.subscription_id = l.id and b.kind = 'retention_purge_notice')
    from latest l
    join public.profiles p on p.id = l.user_id
   where l.status = 'expired' and l.ended_at is not null
     and coalesce(p.role, 'user') in ('user','test')
     and l.ended_at < now() + interval '1 day'
   order by l.ended_at
   limit greatest(1, least(coalesce(p_limit, 200), 1000));
$$;
revoke all on function public.retention_purge_due(int) from public, anon, authenticated;
grant execute on function public.retention_purge_due(int) to service_role;
