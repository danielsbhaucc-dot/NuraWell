-- 000229: auth_session_trail had no FK to auth.users, so trail rows of a user deleted before the daily seal stayed
-- plaintext forever: sealing needs the user's DEK (user_data_keys -> auth.users), whose insert fails with 23503.
-- That made every session-trail-seal run report encOk=false to the parent console.
-- Fix: drop orphan rows (their owner is erased; encrypted rows of erased users are already crypto-shredded via the
-- DEK cascade) and cascade future user deletions, same as user_data_keys.
delete from public.auth_session_trail t where not exists (select 1 from auth.users u where u.id = t.user_id);
alter table public.auth_session_trail
  add constraint auth_session_trail_user_fk foreign key (user_id) references auth.users(id) on delete cascade;
