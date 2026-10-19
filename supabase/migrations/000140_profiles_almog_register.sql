-- ALMOG_VOICE: one register per user, derived from their own messages (sticky). Default casual.
alter table public.profiles add column if not exists almog_register text
  check (almog_register in ('casual', 'formal'));
