import { UPSTASH_NAMESPACE_SYSTEM_KNOWLEDGE } from './rag-config';

/**
 * ידע מערכת ב-Upstash Vector — אינדקס נפרד מזיכרון המשתמש.
 * משתני סביבה ייעודיים: UPSTASH_SYSTEM_VECTOR_REST_URL / UPSTASH_SYSTEM_VECTOR_REST_TOKEN
 */

export type SystemKnowledgeVectorMetadata = {
  dataType: 'step' | 'course';
  accessLevel: 'public' | 'premium';
  chunkId: string;
  text: string;
  /** מזהה מסמך ב-almog_knowledge (לניהול ומחיקה) */
  docId?: string;
  /** מזהה צעד במסע (journey_steps.id) — כש־dataType === 'step' */
  stepId?: string;
  /** מספר צעד להצגה וסינון (1, 2, …) */
  stepNumber?: number;
  /** תחנה במסע */
  stationId?: string;
  stationTitle?: string;
  stationOrder?: number;
  courseId?: string;
};

export type SystemKnowledgeQueryHit = {
  id: string;
  score: number;
  metadata?: Record<string, unknown>;
};

function baseUrl(): string {
  const u = process.env.UPSTASH_SYSTEM_VECTOR_REST_URL?.trim();
  if (!u) throw new Error('UPSTASH_SYSTEM_VECTOR_REST_URL is not set');
  return u.replace(/\/+$/, '');
}

function token(): string {
  const t = process.env.UPSTASH_SYSTEM_VECTOR_REST_TOKEN?.trim();
  if (!t) throw new Error('UPSTASH_SYSTEM_VECTOR_REST_TOKEN is not set');
  return t;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Upstash Vector HTTP ${res.status}: ${errText}`);
  }

  return (await res.json()) as T;
}

function nsPath(namespace: string, action: 'upsert' | 'query' | 'delete' | 'range'): string {
  return `/${action}/${encodeURIComponent(namespace)}`;
}

export type SystemKnowledgeRangeVector = {
  id: string;
  metadata?: SystemKnowledgeVectorMetadata | Record<string, unknown>;
};

export type SystemKnowledgeRangeResult = {
  nextCursor: string;
  vectors: SystemKnowledgeRangeVector[];
};

export function isSystemKnowledgeVectorConfigured(): boolean {
  return Boolean(
    process.env.UPSTASH_SYSTEM_VECTOR_REST_URL?.trim() &&
      process.env.UPSTASH_SYSTEM_VECTOR_REST_TOKEN?.trim()
  );
}

/** מילוט מזהים למסנן מטא־דאטה של Upstash. */
export function escapeFilterString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

const UPSERT_CONCURRENCY = 6;

/**
 * Upsert — כל וקטור בנפרד לנתיב `/upsert/{namespace}` (תואם דוגמת ה-curl הרשמית ל-namespace).
 */
export async function upsertSystemKnowledgeVectors(
  rows: Array<{
    id: string;
    vector: number[];
    metadata: SystemKnowledgeVectorMetadata;
  }>
): Promise<void> {
  if (rows.length === 0) return;
  const path = nsPath(UPSTASH_NAMESPACE_SYSTEM_KNOWLEDGE, 'upsert');
  for (let i = 0; i < rows.length; i += UPSERT_CONCURRENCY) {
    const slice = rows.slice(i, i + UPSERT_CONCURRENCY);
    await Promise.all(slice.map((row) => postJson<{ result?: string }>(path, row)));
  }
}

export async function querySystemKnowledgeVectors(params: {
  vector: number[];
  topK: number;
  filter: string;
}): Promise<SystemKnowledgeQueryHit[]> {
  const json = await postJson<{ result?: SystemKnowledgeQueryHit[] }>(
    nsPath(UPSTASH_NAMESPACE_SYSTEM_KNOWLEDGE, 'query'),
    {
      vector: params.vector,
      topK: params.topK,
      includeMetadata: true,
      filter: params.filter,
    }
  );
  return json.result ?? [];
}

/** מזהה וקטור דטרמיניסטי לפי מסמך ואינדקס chunk */
export function systemKnowledgeVectorId(docId: string, chunkIndex: number): string {
  return `${docId}:${chunkIndex}`;
}

export function systemKnowledgeVectorIdsForDoc(docId: string, chunkCount: number): string[] {
  const ids: string[] = [];
  for (let i = 0; i < chunkCount; i += 1) {
    ids.push(systemKnowledgeVectorId(docId, i));
  }
  return ids;
}

const DELETE_CONCURRENCY = 20;

export async function deleteSystemKnowledgeVectorsByIds(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const path = nsPath(UPSTASH_NAMESPACE_SYSTEM_KNOWLEDGE, 'delete');
  let deleted = 0;

  for (let i = 0; i < ids.length; i += DELETE_CONCURRENCY) {
    const slice = ids.slice(i, i + DELETE_CONCURRENCY);
    const json = await deleteJson<{ result?: { deleted?: number } }>(path, { ids: slice });
    deleted += json.result?.deleted ?? slice.length;
  }

  return deleted;
}

async function deleteJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Upstash Vector HTTP ${res.status}: ${errText}`);
  }

  return (await res.json()) as T;
}

/** סריקת כל הווקטורים ב-namespace (ל-backfill) */
export async function rangeSystemKnowledgeVectors(params: {
  cursor?: string;
  limit?: number;
  prefix?: string;
}): Promise<SystemKnowledgeRangeResult> {
  const json = await postJson<{
    nextCursor?: string;
    vectors?: SystemKnowledgeRangeVector[];
    result?:
      | SystemKnowledgeRangeVector[]
      | { nextCursor?: string; vectors?: SystemKnowledgeRangeVector[] };
  }>(nsPath(UPSTASH_NAMESPACE_SYSTEM_KNOWLEDGE, 'range'), {
    cursor: params.cursor ?? '0',
    limit: params.limit ?? 100,
    includeMetadata: true,
    ...(params.prefix ? { prefix: params.prefix } : {}),
  });

  const nested = json.result;
  const page =
    nested && typeof nested === 'object' && !Array.isArray(nested)
      ? nested
      : { nextCursor: json.nextCursor, vectors: json.vectors ?? (Array.isArray(nested) ? nested : []) };

  const vectors = page.vectors ?? [];
  return {
    nextCursor: page.nextCursor ?? '',
    vectors: Array.isArray(vectors) ? vectors : [],
  };
}

/** סריקה מלאה של כל הווקטורים (עד סיום cursor) */
export async function rangeAllSystemKnowledgeVectors(params?: {
  limitPerPage?: number;
}): Promise<SystemKnowledgeRangeVector[]> {
  const limit = params?.limitPerPage ?? 100;
  const all: SystemKnowledgeRangeVector[] = [];
  let cursor = '0';

  for (let guard = 0; guard < 10_000; guard += 1) {
    const page = await rangeSystemKnowledgeVectors({ cursor, limit });
    all.push(...page.vectors);
    if (!page.nextCursor || page.vectors.length === 0) break;
    cursor = page.nextCursor;
  }

  return all;
}
