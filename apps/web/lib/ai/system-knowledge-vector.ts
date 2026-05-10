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
  /** מזהה צעד במסע (journey_steps.id) — כש־dataType === 'step' */
  stepId?: string;
  /** מספר צעד להצגה וסינון (1, 2, …) */
  stepNumber?: number;
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

function nsPath(namespace: string, action: 'upsert' | 'query'): string {
  return `/${action}/${encodeURIComponent(namespace)}`;
}

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
