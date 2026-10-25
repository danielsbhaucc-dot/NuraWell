-- Round-4 security: these profile columns become per-user encrypted (enc:v2), so the DB can no longer
-- check their values. The allowed values are enforced in the app before encryption
-- (apps/web/lib/security/profile-enums.ts, called from sealProfilePatch).
alter table public.profiles drop constraint if exists profiles_gender_check;
alter table public.profiles drop constraint if exists profiles_activity_level_check;
alter table public.profiles drop constraint if exists profiles_main_goal_check;
alter table public.profiles drop constraint if exists profiles_main_obstacle_check;
alter table public.profiles drop constraint if exists profiles_weakest_time_of_day_check;
comment on column public.profiles.gender is 'enum validated app-side (profile-enums.ts) before encryption';
comment on column public.profiles.activity_level is 'enum validated app-side (profile-enums.ts) before encryption';
comment on column public.profiles.main_goal is 'enum validated app-side (profile-enums.ts) before encryption';
comment on column public.profiles.main_obstacle is 'enum validated app-side (profile-enums.ts) before encryption';
comment on column public.profiles.weakest_time_of_day is 'enum validated app-side (profile-enums.ts) before encryption';
