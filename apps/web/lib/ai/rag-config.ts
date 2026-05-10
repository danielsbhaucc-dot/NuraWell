/** קבועי RAG — זיכרון משתמש ב-Upstash (מודולרי ל-namespaces נוספים בעתיד). */

/** Namespace ייעודי לזיכרון צ'אט; בעתיד אפשר להוסיף למשל `course-material`. */
export const UPSTASH_NAMESPACE_USER_MEMORY = 'user-memory';

/** ידע מערכת (RAG) — אינדקס Upstash ייעודי (UPSTASH_SYSTEM_VECTOR_*); namespace לוגי בתוך האינדקס. */
export const UPSTASH_NAMESPACE_SYSTEM_KNOWLEDGE = 'system-knowledge';

export const EMBEDDING_MODEL_OPENROUTER = 'openai/text-embedding-3-small';

/** חילוץ עובדות אסינכרוני — Llama 4 Scout דרך OpenRouter */
export const MEMORY_EXTRACTION_MODEL_OPENROUTER = 'meta-llama/llama-4-scout';

export const RAG_TOP_K = 3;

/** כמה מועמדים לבדוק לאיחוד כפילויות */
export const DEDUP_QUERY_TOP_K = 12;

/**
 * ציון דמיון מינימלי לאיחוד (Upstash מחזיר ציון גבוה = דומה יותר).
 * כיוון עשוי להשתנות לפי מדד — ניתן לכוון סביב 0.85–0.92.
 */
export const SIMILARITY_MERGE_THRESHOLD = 0.88;
