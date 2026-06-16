-- ============================================================
-- NuraWell — ביטול migration 000060_user_insights_pgvector.sql
-- הרץ ידנית רק בסביבה שבה 000060 הישנה (pgvector) כבר הוחלה.
-- קובץ 000060 ב-repo כבר no-op — סביבות חדשות לא צריכות סקריפט זה.
-- ============================================================

-- RPC חיפוש סמנטי
DROP FUNCTION IF EXISTS public.match_user_insights(vector, float, int, uuid, text[]);

-- אינדקס HNSW על עמודת embedding
DROP INDEX IF EXISTS public.idx_user_insights_embedding_hnsw;

-- עמודת וקטור בטבלת תובנות
ALTER TABLE public.user_insights DROP COLUMN IF EXISTS embedding;

-- אופציונלי: הסרת הרחבת pgvector רק אם אין טבלאות/עמודות אחרות שמשתמשות בה.
-- אם DROP נכשל — השאר את השורה בהערה; זה לא מפריע לתפקוד.
-- DROP EXTENSION IF EXISTS vector;
