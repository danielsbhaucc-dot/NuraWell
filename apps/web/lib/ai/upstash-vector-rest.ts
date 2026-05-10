import { UPSTASH_NAMESPACE_USER_MEMORY } from './rag-config';

export type MemoryVectorCategory = 'strength' | 'weakness' | 'success' | 'failure' | 'schedule';

export type UserMemoryVectorMetadata = {
  userId: string;
  /** טקסט קצר בעברית להזרקה לפרומפט */
  text: string;
  category: MemoryVectorCategory;
  updatedAt: string;
  /** גרסת סכימה — לעתיד */
  schema?: string;
};

export type QueryHit = {
  id: string;
  score: number;
  metadata?: UserMemoryVectorMetadata | Record<string, unknown>;
};

function baseUrl(): string {
  const u = process.env.UPSTASH_VECTOR_REST_URL?.trim();
  if (!u) throw new Error('UPSTASH_VECTOR_REST_URL is not set');
  return u.replace(/\/+$/, '');
}

function token(): string {
  const t = process.env.UPSTASH_VECTOR_REST_TOKEN?.trim();
  if (!t) throw new Error('UPSTASH_VECTOR_REST_TOKEN is not set');
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
  const enc = encodeURIComponent(namespace);
  return `/${action}/${enc}`;
}

/**
 * שליפת זיכרונות רלוונטיים למשתמש ב-namespace נתון.
 */
export async function queryUserMemoryVectors(params: {
  namespace?: string;
  userId: string;
  vector: number[];
  topK: number;
}): Promise<QueryHit[]> {
  const namespace = params.namespace ?? UPSTASH_NAMESPACE_USER_MEMORY;
  const uid = params.userId.replace(/'/g, "''");
  const filter = `userId = '${uid}'`;

  const json = await postJson<{ result?: QueryHit[] }>(
    nsPath(namespace, 'query'),
    {
      vector: params.vector,
      topK: params.topK,
      includeMetadata: true,
      filter,
    }
  );

  return json.result ?? [];
}

export async function upsertUserMemoryVector(params: {
  namespace?: string;
  id: string;
  vector: number[];
  metadata: UserMemoryVectorMetadata;
}): Promise<void> {
  const namespace = params.namespace ?? UPSTASH_NAMESPACE_USER_MEMORY;

  await postJson(
    nsPath(namespace, 'upsert'),
    {
      id: params.id,
      vector: params.vector,
      metadata: {
        ...params.metadata,
        schema: params.metadata.schema ?? 'nw-memory-v1',
      },
    }
  );
}

export function isUpstashVectorConfigured(): boolean {
  return Boolean(process.env.UPSTASH_VECTOR_REST_URL?.trim() && process.env.UPSTASH_VECTOR_REST_TOKEN?.trim());
}
