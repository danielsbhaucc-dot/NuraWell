-- DB-layer guard: once a user's latest health_data consent is granted=false, no health data
-- can be written for them — regardless of which code path (service role included) attempts it.
create or replace function public.health_consent_withdrawn(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select not granted from public.user_consents
    where user_id = p_user and consent_type = 'health_data'
    order by created_at desc limit 1
  ), false);
$$;
revoke all on function public.health_consent_withdrawn(uuid) from public, anon, authenticated;

-- measurements: reject outright
create or replace function public.trg_measurements_health_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.health_consent_withdrawn(new.user_id) then
    raise exception 'health_consent_withdrawn' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists measurements_health_guard on public.user_measurements;
create trigger measurements_health_guard before insert or update on public.user_measurements
  for each row execute function public.trg_measurements_health_guard();

-- profiles: force health columns empty (other profile fields still save normally)
create or replace function public.trg_profiles_health_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.health_consent_withdrawn(new.id) then
    new.current_weight_kg := null;
    new.goal_weight_kg := null;
    new.height_cm := null;
    new.activity_level := null;
    new.health_conditions := '[]'::jsonb;
    new.dietary_preferences := '[]'::jsonb;
  end if;
  return new;
end $$;
drop trigger if exists profiles_health_guard on public.profiles;
create trigger profiles_health_guard before insert or update on public.profiles
  for each row execute function public.trg_profiles_health_guard();

-- memories: reject rows explicitly categorised as health
create or replace function public.trg_memories_health_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.category = 'health' and public.health_consent_withdrawn(new.user_id) then
    raise exception 'health_consent_withdrawn' using errcode = '42501';
  end if;
  return new;
end $$;
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='user_memories' and column_name='category') then
    drop trigger if exists memories_health_guard on public.user_memories;
    create trigger memories_health_guard before insert or update on public.user_memories
      for each row execute function public.trg_memories_health_guard();
  end if;
end $$;
