-- Birth dates are personal data. A DATE column cannot hold enc:v2 text.
-- Keep every existing value as an ISO date string. Do not delete or rewrite rows here.
-- App writes after this migration store enc:v2. Readers accept both forms until a later backfill.

alter table public.profiles
  alter column date_of_birth type text using to_char(date_of_birth, 'YYYY-MM-DD');

alter table public.profiles
  alter column birth_date type text using to_char(birth_date, 'YYYY-MM-DD');
