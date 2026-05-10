import type { QueryHit, UserMemoryVectorMetadata } from './upstash-vector-rest';

function isMemoryMeta(m: unknown): m is UserMemoryVectorMetadata {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return false;
  const o = m as Record<string, unknown>;
  return typeof o.text === 'string' && typeof o.userId === 'string';
}

const CATEGORY_LABEL: Record<string, string> = {
  strength: 'חוזק',
  weakness: 'חולשה',
  success: 'הצלחה',
  failure: 'כשל',
  schedule: 'לו״ז / התחייבות',
};

/**
 * טקסט להזרקה ל-system prompt — עד k פריטים.
 */
export function formatRagMemoryContextBlock(hits: QueryHit[], maxItems = 3): string {
  const lines: string[] = [];
  let n = 0;
  for (const h of hits) {
    if (n >= maxItems) break;
    const meta = h.metadata;
    if (!isMemoryMeta(meta)) continue;
    const label = CATEGORY_LABEL[meta.category] ?? meta.category;
    lines.push(`- (${label}) ${meta.text}`);
    n += 1;
  }
  if (!lines.length) return '';
  return `זיכרון רלוונטי משיחות קודמות (שליפה סמנטית, לא רשימה מלאה):\n${lines.join('\n')}`;
}
