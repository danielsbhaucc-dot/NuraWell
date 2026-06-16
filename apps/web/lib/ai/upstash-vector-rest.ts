import { UPSTASH_NAMESPACE_USER_MEMORY } from './rag-config';

import { MEMORY_FACT_CATEGORIES, type MemoryFactCategory } from './memory-dossier/types';

const MEMORY_FACT_CATEGORY_SET = new Set<string>(MEMORY_FACT_CATEGORIES);

/** קטגוריות זיכרון וקטורי — alias לסכימה המורחבת */
export type MemoryVectorCategory = MemoryFactCategory;

export type UserMemoryVectorMetadata = {
  userId: string;
  /** טקסט קצר בעברית להזרקה לפרומפט */
  text: string;
  category: MemoryVectorCategory;
  /** קטגוריית user_insights (fitness, mental, …) — רק כש-isInsight */
  insightCategory?: string;
  /** סטטוס user_insights — Active / Deprecated / NeedsVerification */
  insightStatus?: string;
  updatedAt: string;
  /** מתי הזיכרון נוצר לראשונה */
  firstSeenAt?: string;
  /** מתי אותו דפוס/זיכרון נראה שוב לאחרונה */
  lastSeenAt?: string;
  /** כמה פעמים הזיכרון חוזק דרך exact refresh או merge סמנטי */
  seenCount?: number;
  /** מזהי זיכרונות שנבלעו לתוך השורה הזו בעת מיזוג/החלפה */
  supersedes?: string[];
  /** גרסת סכימה — לעתיד */
  schema?: string;
  /** רמת תובנה — 2 דפוס, 3 תובנה, 4 שבירה */
  memoryLevel?: 2 | 3 | 4;
  /** תובנה מובחנת (רמה 3+) */
  isInsight?: boolean;
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

function nsPath(namespace: string, action: 'upsert' | 'query' | 'delete' | 'range'): string {
  const enc = encodeURIComponent(namespace);
  return `/${action}/${enc}`;
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

/**
 * שליפת זיכרונות רלוונטיים למשתמש ב-namespace נתון.
 */
export async function queryUserMemoryVectors(params: {
  namespace?: string;
  userId: string;
  vector: number[];
  topK: number;
  /** מסנן מטא-דאטה מלא; ברירת מחדל — userId בלבד */
  filter?: string;
}): Promise<QueryHit[]> {
  const namespace = params.namespace ?? UPSTASH_NAMESPACE_USER_MEMORY;
  const uid = params.userId.replace(/'/g, "''");
  const filter = params.filter ?? `userId = '${uid}'`;

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

export type UserMemoryListItem = {
  id: string;
  text: string;
  category: MemoryVectorCategory;
  memoryLevel?: 2 | 3 | 4;
  isInsight?: boolean;
  updatedAt: string;
  firstSeenAt?: string;
  lastSeenAt?: string;
  seenCount?: number;
};

function parseUserMemoryMetadata(
  raw: UserMemoryVectorMetadata | Record<string, unknown> | undefined
): UserMemoryListItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as UserMemoryVectorMetadata;
  const text = typeof m.text === 'string' ? m.text.trim() : '';
  if (!text) return null;
  const category = m.category;
  if (typeof category !== 'string' || !MEMORY_FACT_CATEGORY_SET.has(category)) {
    return null;
  }
  return {
    id: '',
    text,
    category,
    memoryLevel: m.memoryLevel,
    isInsight: m.isInsight,
    updatedAt: typeof m.updatedAt === 'string' ? m.updatedAt : '',
    firstSeenAt: typeof m.firstSeenAt === 'string' ? m.firstSeenAt : undefined,
    lastSeenAt: typeof m.lastSeenAt === 'string' ? m.lastSeenAt : undefined,
    seenCount: typeof m.seenCount === 'number' ? m.seenCount : undefined,
  };
}

/** רשימת כל זיכרונות המשתמש — סריקת range עם סינון מטא-דאטה */
export async function listUserMemoryVectors(userId: string): Promise<UserMemoryListItem[]> {
  const namespace = UPSTASH_NAMESPACE_USER_MEMORY;
  const items: UserMemoryListItem[] = [];
  let cursor = '0';

  for (let guard = 0; guard < 500; guard += 1) {
    const json = await postJson<{
      nextCursor?: string;
      vectors?: Array<{ id: string; metadata?: UserMemoryVectorMetadata | Record<string, unknown> }>;
      result?:
        | Array<{ id: string; metadata?: UserMemoryVectorMetadata | Record<string, unknown> }>
        | {
            nextCursor?: string;
            vectors?: Array<{ id: string; metadata?: UserMemoryVectorMetadata | Record<string, unknown> }>;
          };
    }>(nsPath(namespace, 'range'), {
      cursor,
      limit: 200,
      includeMetadata: true,
    });

    const nested = json.result;
    const page =
      nested && typeof nested === 'object' && !Array.isArray(nested)
        ? nested
        : {
            nextCursor: json.nextCursor,
            vectors: json.vectors ?? (Array.isArray(nested) ? nested : []),
          };

    const vectors = page.vectors ?? [];
    for (const v of vectors) {
      const meta = v.metadata;
      if (!meta || typeof meta !== 'object') continue;
      const metaUserId = (meta as { userId?: string }).userId;
      if (metaUserId !== userId) continue;
      const parsed = parseUserMemoryMetadata(meta);
      if (parsed) {
        items.push({ ...parsed, id: v.id });
      }
    }

    if (!page.nextCursor || vectors.length === 0) break;
    cursor = page.nextCursor;
  }

  items.sort((a, b) => {
    const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
    const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
    return tb - ta;
  });

  return items;
}

export async function deleteUserMemoryVectorById(id: string): Promise<void> {
  const path = nsPath(UPSTASH_NAMESPACE_USER_MEMORY, 'delete');
  await deleteJson(path, { ids: [id] });
}
