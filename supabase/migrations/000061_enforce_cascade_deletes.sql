-- ============================================================
-- NuraWell — Enforce CASCADE deletes for AI mentor privacy data
-- Migration: 000061_enforce_cascade_deletes.sql
--
-- When a profile (or upstream auth.users row) is deleted, all mentor
-- memory artifacts must be removed immediately.
-- ============================================================

-- ── user_insights ─────────────────────────────────────────────
DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'user_insights'
      AND con.contype = 'f'
      AND con.conkey @> ARRAY[
        (SELECT attnum FROM pg_attribute
         WHERE attrelid = rel.oid AND attname = 'user_id' AND NOT attisdropped)
      ]
  LOOP
    EXECUTE format(
      'ALTER TABLE public.user_insights DROP CONSTRAINT IF EXISTS %I',
      constraint_name
    );
  END LOOP;
END $$;

ALTER TABLE public.user_insights
  ADD CONSTRAINT user_insights_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- ── user_mentorship_strategy ──────────────────────────────────
DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'user_mentorship_strategy'
      AND con.contype = 'f'
      AND con.conkey @> ARRAY[
        (SELECT attnum FROM pg_attribute
         WHERE attrelid = rel.oid AND attname = 'user_id' AND NOT attisdropped)
      ]
  LOOP
    EXECUTE format(
      'ALTER TABLE public.user_mentorship_strategy DROP CONSTRAINT IF EXISTS %I',
      constraint_name
    );
  END LOOP;
END $$;

ALTER TABLE public.user_mentorship_strategy
  ADD CONSTRAINT user_mentorship_strategy_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- ── pending_chat_logs ─────────────────────────────────────────
DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'pending_chat_logs'
      AND con.contype = 'f'
      AND con.conkey @> ARRAY[
        (SELECT attnum FROM pg_attribute
         WHERE attrelid = rel.oid AND attname = 'user_id' AND NOT attisdropped)
      ]
  LOOP
    EXECUTE format(
      'ALTER TABLE public.pending_chat_logs DROP CONSTRAINT IF EXISTS %I',
      constraint_name
    );
  END LOOP;
END $$;

ALTER TABLE public.pending_chat_logs
  ADD CONSTRAINT pending_chat_logs_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

COMMENT ON CONSTRAINT user_insights_user_id_fkey ON public.user_insights IS
  'Cascade delete insights when profile is removed (privacy compliance).';

COMMENT ON CONSTRAINT user_mentorship_strategy_user_id_fkey ON public.user_mentorship_strategy IS
  'Cascade delete mentorship strategy when profile is removed (privacy compliance).';

COMMENT ON CONSTRAINT pending_chat_logs_user_id_fkey ON public.pending_chat_logs IS
  'Cascade delete pending chat logs when profile is removed (privacy compliance).';
