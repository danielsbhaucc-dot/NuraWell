-- ============================================================
-- NuraWell — Chat sessions (Intercom-style) + durable user memories
-- Migration: 000062_chat_sessions_user_memories.sql
--
-- וקטורים: אחסון סמנטי בלבד ב-Upstash (namespace `user-memory` הקיים).
-- טבלת user_memories שומרת טקסט + מזהה וקטור — ללא עמודת pgvector.
-- ============================================================

-- ── chat_sessions ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.chat_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'open'
                CHECK (status IN ('open', 'closed')),
  summary     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_status
  ON public.chat_sessions (user_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_open
  ON public.chat_sessions (user_id)
  WHERE status = 'open';

COMMENT ON TABLE public.chat_sessions IS
  'סשן שיחה עם אלמוג — open/closed + סיכום בסגירה (Intercom-style).';

-- ── user_memories ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_memories (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  memory_text         TEXT NOT NULL,
  category            TEXT NOT NULL DEFAULT 'personal'
                        CHECK (char_length(category) BETWEEN 2 AND 40),
  upstash_vector_id   TEXT NOT NULL,
  source_session_id   UUID REFERENCES public.chat_sessions(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT user_memories_text_len CHECK (char_length(memory_text) BETWEEN 4 AND 600)
);

CREATE INDEX IF NOT EXISTS idx_user_memories_user_id
  ON public.user_memories (user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_memories_upstash_id
  ON public.user_memories (upstash_vector_id);

COMMENT ON TABLE public.user_memories IS
  'זיכרונות משתמש מחולצים מסגירת סשן. וקטור ב-Upstash (user-memory) — לא pgvector.';
COMMENT ON COLUMN public.user_memories.upstash_vector_id IS
  'מזהה ב-Upstash Vector namespace user-memory — אותו אינדקס הקיים.';

-- ── RLS ───────────────────────────────────────────────────────

ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_memories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_chat_sessions" ON public.chat_sessions;
CREATE POLICY "users_own_chat_sessions" ON public.chat_sessions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_own_user_memories" ON public.user_memories;
CREATE POLICY "users_own_user_memories" ON public.user_memories
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "admins_view_chat_sessions" ON public.chat_sessions;
CREATE POLICY "admins_view_chat_sessions" ON public.chat_sessions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "admins_view_user_memories" ON public.user_memories;
CREATE POLICY "admins_view_user_memories" ON public.user_memories
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- כתיבה ל-user_memories רק דרך service_role (סגירת סשן בשרת)
REVOKE INSERT, UPDATE, DELETE ON public.user_memories FROM authenticated;
GRANT SELECT ON public.user_memories TO authenticated;
GRANT ALL ON public.user_memories TO service_role;

GRANT SELECT, INSERT, UPDATE ON public.chat_sessions TO authenticated;
GRANT ALL ON public.chat_sessions TO service_role;
