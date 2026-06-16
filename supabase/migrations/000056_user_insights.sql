-- ============================================================
-- NuraWell — Insight Extraction Engine (תובנות משתמש מובנות)
-- Migration: 000056_user_insights.sql
--
-- מנוע ניתוח אסינכרוני קורא את לוג הצ'אט (ai_interactions) ומחלץ תובנות
-- אישיות ובנות-פעולה על המשתמש: העדפות סמויות, חסמים, יעדים, ו"מידע חסר"
-- שהמנטור צריך לאסוף בעדינות בשיחות הבאות. התובנות נשמרות כאן בצורה מובנית
-- כדי שאפשר יהיה להזריק אותן בחזרה לפרומפט של המנטור (getMentorContext).
--
-- dedupe: UNIQUE(user_id, dedupe_key) *מלא* (לא חלקי) — כדי ש-ON CONFLICT
-- יעבוד נקי כ-upsert (ראה האזהרה ב-almog-commitments/persist.ts על אינדקס חלקי).
-- כך אם המשתמש מדבר על אותו דבר שוב — אנחנו *ממזגים/מעדכנים* במקום לשכפל.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_insights (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- סוג התובנה. 'preference'/'missing_info' נוספו על הבסיס שבמפרט כדי לתמוך
  -- בהעדפות סמויות וב"מה עוד צריך לברר" (מידע חסר) כאזרחים מן המניין.
  category            TEXT NOT NULL
                        CHECK (category IN (
                          'fitness', 'nutrition', 'mental',
                          'blocker', 'goal', 'preference', 'missing_info'
                        )),

  insight_text        TEXT NOT NULL,

  -- כמה התובנה ניתנת-לפעולה למנטור (1 = טריוויאלי/הקשר, 10 = מנוף שינוי ישיר).
  actionability_score SMALLINT NOT NULL DEFAULT 5
                        CHECK (actionability_score BETWEEN 1 AND 10),

  -- ביטחון המודל בתובנה (0..1). משמש לדירוג ולסינון רעש.
  confidence          REAL NOT NULL DEFAULT 0.7
                        CHECK (confidence BETWEEN 0 AND 1),

  is_active           BOOLEAN NOT NULL DEFAULT TRUE,

  -- מפתח נרמול יציב למיזוג כפילויות (category + ליבת הטקסט).
  dedupe_key          TEXT NOT NULL,

  -- מטא למיזוג: כמה פעמים התובנה הופיעה, ומתי נראתה לאחרונה (טריות לדירוג).
  mention_count       INTEGER NOT NULL DEFAULT 1,
  last_seen_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- מקור: באיזה session זוהתה לראשונה (לאבחון/audit).
  source_session_id   UUID,

  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- ה-arbiter ל-upsert. מלא (לא חלקי) בכוונה — ראה הערת ה-migration למעלה.
  UNIQUE (user_id, dedupe_key)
);

COMMENT ON TABLE public.user_insights IS
  'Structured, actionable insights extracted asynchronously from chat logs. Injected back into the AI mentor system prompt via getMentorContext(). Deduped per (user_id, dedupe_key) so repeated topics merge instead of duplicating.';

-- שליפת התובנות הפעילות הכי בנות-פעולה למשתמש (ה-hot path של getMentorContext).
CREATE INDEX IF NOT EXISTS idx_user_insights_active_ranked
  ON public.user_insights (user_id, actionability_score DESC, last_seen_at DESC)
  WHERE is_active = TRUE;

-- שליפה לפי קטגוריה (למשל כל ה-missing_info שצריך לברר).
CREATE INDEX IF NOT EXISTS idx_user_insights_user_category
  ON public.user_insights (user_id, category)
  WHERE is_active = TRUE;

-- ── updated_at trigger (משתמש בפונקציה הקיימת מ-000001/000002) ──
CREATE OR REPLACE TRIGGER update_user_insights_updated_at
  BEFORE UPDATE ON public.user_insights
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Row Level Security
-- הכתיבה נעשית *רק* בצד-שרת דרך service role (admin client), שעוקף RLS —
-- כדי להגן על פרטיות המשתמש (החילוץ אף פעם לא רץ בדפדפן). המשתמש יכול
-- לקרוא את התובנות של עצמו בלבד; אדמין לקריאה לצורכי תמיכה.
-- ============================================================
ALTER TABLE public.user_insights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_insights_select_own ON public.user_insights;
CREATE POLICY user_insights_select_own
  ON public.user_insights FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS user_insights_admin_read ON public.user_insights;
CREATE POLICY user_insights_admin_read
  ON public.user_insights FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS user_insights_service_role_all ON public.user_insights;
CREATE POLICY user_insights_service_role_all
  ON public.user_insights FOR ALL TO service_role
  USING (TRUE) WITH CHECK (TRUE);
