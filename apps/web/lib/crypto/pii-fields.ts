/**
 * מיפוי שדות רגישים לטבלאות + עזרי הצפנה/פענוח לשורות.
 * שרת בלבד (המפתח ב-env). קריאה תואמת לאחור: מספר/מחרוזת/JSON לא מוצפנים חוזרים כמו שהם.
 */
import { decryptJson, decryptString, encryptJson, encryptString, isEncrypted } from './pii';

export const PROFILE_ENC_NUMERIC = ['current_weight_kg', 'goal_weight_kg', 'height_cm'] as const;
export const PROFILE_ENC_JSON = ['health_conditions', 'dietary_preferences'] as const;
export const PROFILE_ENC_TEXT = ['main_obstacle_detail', 'ai_system_prompt'] as const;

export const MEASUREMENT_ENC_NUMERIC = ['weight_kg', 'height_cm', 'bmi'] as const;
export const MEASUREMENT_ENC_TEXT = ['notes'] as const;

type Row = Record<string, unknown>;

function encNumber(v: unknown, userId: string): unknown {
  if (v === null || v === undefined || v === '') return v === '' ? null : v;
  if (isEncrypted(v)) return v;
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  return encryptString(String(n), userId);
}

function decNumber(v: unknown, userId: string): number | null {
  if (v === null || v === undefined || v === '') return null;
  const s = typeof v === 'string' ? decryptString(v, userId) : v;
  const n = typeof s === 'number' ? s : Number(s);
  return Number.isFinite(n) ? n : null;
}

function encText(v: unknown, userId: string): unknown {
  if (v === null || v === undefined) return v;
  if (isEncrypted(v)) return v;
  const s = String(v);
  return s === '' ? s : encryptString(s, userId);
}

function decText(v: unknown, userId: string): string | null {
  if (v === null || v === undefined) return null;
  return typeof v === 'string' ? decryptString(v, userId) : String(v);
}

function mapFields<T extends Row>(
  row: T,
  userId: string,
  spec: { numeric: readonly string[]; json: readonly string[]; text: readonly string[] },
  mode: 'enc' | 'dec'
): T {
  const out: Row = { ...row };
  for (const f of spec.numeric) if (f in out) out[f] = mode === 'enc' ? encNumber(out[f], userId) : decNumber(out[f], userId);
  for (const f of spec.json) if (f in out) out[f] = mode === 'enc' ? encryptJson(out[f], userId) : decryptJson(out[f], userId);
  for (const f of spec.text) if (f in out) out[f] = mode === 'enc' ? encText(out[f], userId) : decText(out[f], userId);
  return out as T;
}

const PROFILE_SPEC = { numeric: PROFILE_ENC_NUMERIC, json: PROFILE_ENC_JSON, text: PROFILE_ENC_TEXT };
const MEAS_SPEC = { numeric: MEASUREMENT_ENC_NUMERIC, json: [] as const, text: MEASUREMENT_ENC_TEXT };

/** patch לכתיבה ל-profiles (id = userId) */
export function encryptProfilePatch<T extends Row>(patch: T, userId: string): T {
  const out = mapFields(patch, userId, PROFILE_SPEC, 'enc') as Row;
  if ('ai_context' in out) out.ai_context = encryptAiContext(out.ai_context, userId);
  return out as T;
}

/** שורת profiles שנקראה (userId = row.id אם לא ניתן) */
export function decryptProfileRow<T extends Row | null | undefined>(row: T, userId?: string): T {
  if (!row) return row;
  const uid = userId ?? (row.id as string | undefined);
  if (!uid) return row;
  const out = mapFields(row as Row, uid, PROFILE_SPEC, 'dec') as Row;
  if ('ai_context' in out) out.ai_context = decryptAiContext(out.ai_context, uid);
  return out as T;
}

export function decryptProfileRows<T extends Row>(rows: T[] | null | undefined): T[] {
  return (rows ?? []).map((r) => decryptProfileRow(r));
}

export function encryptMeasurementPatch<T extends Row>(patch: T, userId: string): T {
  return mapFields(patch, userId, MEAS_SPEC, 'enc');
}

export function decryptMeasurementRow<T extends Row | null | undefined>(row: T, userId?: string): T {
  if (!row) return row;
  const uid = userId ?? (row.user_id as string | undefined);
  if (!uid) return row;
  return mapFields(row as Row, uid, MEAS_SPEC, 'dec') as T;
}

export function decryptMeasurementRows<T extends Row>(rows: T[] | null | undefined, userId?: string): T[] {
  return (rows ?? []).map((r) => decryptMeasurementRow(r, userId));
}

/** תוכן הודעת צ'אט (ai_interactions.content) */
export function encryptChatContent(content: string, userId: string): string {
  return isEncrypted(content) ? content : encryptString(content, userId);
}

export function decryptChatContent(content: unknown, userId: string): string {
  if (content === null || content === undefined) return '';
  if (typeof content !== 'string') return String(content);
  try {
    return decryptString(content, userId);
  } catch {
    return '';
  }
}

/** שורת ai_interactions: מפענח content לפי row.user_id או userId */
export function decryptInteractionRow<T extends Row>(row: T, userId?: string): T {
  const uid = userId ?? (row.user_id as string | undefined);
  if (!uid || !('content' in row)) return row;
  return { ...row, content: decryptChatContent(row.content, uid) };
}

export function decryptInteractionRows<T extends Row>(rows: T[] | null | undefined, userId?: string): T[] {
  return (rows ?? []).map((r) => decryptInteractionRow(r, userId));
}

type QueryResult = { data: unknown };

function mapResult<R extends QueryResult>(r: R, fn: (row: Row) => Row): R {
  if (!r || r.data === null || r.data === undefined) return r;
  const data = Array.isArray(r.data) ? r.data.map((x) => fn(x as Row)) : fn(r.data as Row);
  return { ...r, data } as R;
}

/** לשימוש: supabase.from('profiles').select(...).eq('id', uid).maybeSingle().then(decProfileResult(uid)) */
export const decProfileResult =
  (userId?: string) =>
  <R extends QueryResult>(r: R): R =>
    mapResult(r, (row) => decryptProfileRow(row, userId ?? (row.id as string | undefined)));

export const decMeasurementResult =
  (userId?: string) =>
  <R extends QueryResult>(r: R): R =>
    mapResult(r, (row) => decryptMeasurementRow(row, userId ?? (row.user_id as string | undefined)));

export const decInteractionResult =
  (userId?: string) =>
  <R extends QueryResult>(r: R): R =>
    mapResult(r, (row) => decryptInteractionRow(row, userId ?? (row.user_id as string | undefined)));

/* ───────────── טקסט נגזר-שיחה (סיכומים, זיכרונות, תובנות) ───────────── */

/** עמודות טקסט מוצפנות לפי טבלה; userId מעמודת user_id */
export const TABLE_ENC_TEXT = {
  chat_sessions: ['title', 'summary', 'preview_text'],
  pending_chat_logs: ['raw_chat_text'],
  user_memories: ['memory_text'],
  user_insights: ['insight_text'],
  chat_periodic_summaries: ['ai_insight'],
} as const;
export type EncTextTable = keyof typeof TABLE_ENC_TEXT;

/** תת-מפתחות טקסט חופשי ב-profiles.ai_context (שאר המפתחות — דגלים/enum — נשארים) */
export const AI_CONTEXT_ENC_KEYS = [
  'chat_summary',
  'struggles',
  'notes',
  'tone_notes',
  'core_insight',
  'main_blocker',
  'current_goal',
  'current_focus',
  'weakness_pattern',
  'life_context',
  'pending_focus',
  'dashboard_brief',
] as const;

export function encryptAiContext<T>(ctx: T, userId: string): T {
  if (!ctx || typeof ctx !== 'object' || Array.isArray(ctx)) return ctx;
  const out: Row = { ...(ctx as Row) };
  for (const k of AI_CONTEXT_ENC_KEYS) if (k in out && out[k] !== null && out[k] !== undefined) out[k] = encryptJson(out[k], userId);
  return out as T;
}

export function decryptAiContext<T>(ctx: T, userId: string): T {
  if (!ctx || typeof ctx !== 'object' || Array.isArray(ctx)) return ctx;
  const out: Row = { ...(ctx as Row) };
  for (const k of AI_CONTEXT_ENC_KEYS) {
    if (!(k in out)) continue;
    try {
      out[k] = decryptJson(out[k], userId);
    } catch {
      delete out[k];
    }
  }
  return out as T;
}

export function encryptTableRow<T extends Row>(table: EncTextTable, row: T, userId: string): T {
  const out: Row = { ...row };
  for (const f of TABLE_ENC_TEXT[table]) if (f in out) out[f] = encText(out[f], userId);
  return out as T;
}

export function decryptTableRow<T extends Row | null | undefined>(table: EncTextTable, row: T, userId?: string): T {
  if (!row) return row;
  const uid = userId ?? (row.user_id as string | undefined);
  if (!uid) return row;
  const out: Row = { ...(row as Row) };
  for (const f of TABLE_ENC_TEXT[table]) {
    if (!(f in out)) continue;
    try {
      out[f] = decText(out[f], uid);
    } catch {
      out[f] = null;
    }
  }
  return out as T;
}

export const decTableResult =
  (table: EncTextTable, userId?: string) =>
  <R extends QueryResult>(r: R): R =>
    mapResult(r, (row) => decryptTableRow(table, row, userId ?? (row.user_id as string | undefined)));
