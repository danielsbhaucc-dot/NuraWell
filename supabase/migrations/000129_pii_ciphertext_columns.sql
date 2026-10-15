-- App-level encryption (AES-256-GCM, lib/crypto/pii.ts): sensitive numeric columns become text so they can hold ciphertext.
-- Existing values are cast to text and then encrypted by apps/web/scripts/encrypt-existing-pii.ts.
-- jsonb columns (health_conditions, dietary_preferences) keep their type and store a JSON string of ciphertext.
alter table public.profiles
  alter column current_weight_kg type text using current_weight_kg::text,
  alter column goal_weight_kg type text using goal_weight_kg::text,
  alter column height_cm type text using height_cm::text;

alter table public.user_measurements
  alter column weight_kg type text using weight_kg::text,
  alter column height_cm type text using height_cm::text,
  alter column bmi type text using bmi::text;

comment on column public.profiles.current_weight_kg is 'ciphertext (enc:v1) — decrypt server-side via lib/crypto/pii-fields';
comment on column public.user_measurements.weight_kg is 'ciphertext (enc:v1) — decrypt server-side via lib/crypto/pii-fields';
comment on column public.ai_interactions.content is 'ciphertext (enc:v1) for new rows — decrypt server-side via lib/crypto/pii-fields';
