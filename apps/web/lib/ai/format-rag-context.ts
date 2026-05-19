import type { QueryHit, UserMemoryVectorMetadata } from './upstash-vector-rest';

function isMemoryMeta(m: unknown): m is UserMemoryVectorMetadata {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return false;
  const o = m as Record<string, unknown>;
  return typeof o.text === 'string' && typeof o.userId === 'string';
}

function metaLevel(meta: UserMemoryVectorMetadata): number {
  return meta.memoryLevel ?? 2;
}

const CATEGORY_LABEL: Record<string, string> = {
  strength: 'חוזק',
  weakness: 'חולשה',
  success: 'הצלחה',
  failure: 'כשל',
  schedule: 'לו״ז / התחייבות',
};

/** קטגוריות שמתאימות יותר ל"דפוסים" מאשר לאירוע חד-פעמי */
const PATTERN_CATEGORIES = new Set<string>(['weakness', 'failure']);

function formatUpdatedHint(iso: string | undefined): string {
  if (!iso || typeof iso !== 'string') return '';
  try {
    const d = new Date(iso.trim());
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' });
  } catch {
    return '';
  }
}

/**
 * טקסט להזרקה ל-system prompt — עד k פריטים.
 * מפריד בין דפוסים (חולשה/כשל) לבין עדכני (חוזק/הצלחה/לו״ז) כדי לתת "משקל" ברור יותר למנטור.
 */
export function formatRagMemoryContextBlock(hits: QueryHit[], maxItems = 3): string {
  const patternLines: string[] = [];
  const recentLines: string[] = [];
  const insightLines: string[] = [];

  const sorted = [...hits].sort((a, b) => {
    const ma = a.metadata && isMemoryMeta(a.metadata) ? metaLevel(a.metadata) : 2;
    const mb = b.metadata && isMemoryMeta(b.metadata) ? metaLevel(b.metadata) : 2;
    return mb - ma;
  });

  let n = 0;
  for (const h of sorted) {
    if (n >= maxItems) break;
    const meta = h.metadata;
    if (!isMemoryMeta(meta)) continue;
    const label = CATEGORY_LABEL[meta.category] ?? meta.category;
    const hint = formatUpdatedHint(meta.updatedAt);
    const suffix = hint ? ` (עודכן ${hint})` : '';
    const insightTag = meta.isInsight || meta.memoryLevel === 4 ? 'תובנה' : label;
    const line =
      meta.memoryLevel && meta.memoryLevel >= 3
        ? `- (${insightTag}) ${meta.text}${suffix}`
        : `- (${label}) ${meta.text}${suffix}`;
    if (meta.memoryLevel && meta.memoryLevel >= 3) {
      insightLines.push(line);
    } else if (PATTERN_CATEGORIES.has(meta.category)) {
      patternLines.push(line);
    } else {
      recentLines.push(line);
    }
    n += 1;
  }

  if (!patternLines.length && !recentLines.length && !insightLines.length) return '';

  const chunks: string[] = [];
  chunks.push(
    'תובנות מזיכרון (רמזים פנימיים בלבד — שלב לכל הפחות תובנה אחת לתשובה; אל תפרט רשימה למשתמש):'
  );
  if (insightLines.length) {
    chunks.push(`תובנות / שבירה:\n${insightLines.join('\n')}`);
  }
  if (recentLines.length) {
    chunks.push(`מוקד עדכני / הצלחות / לו״ז:\n${recentLines.join('\n')}`);
  }
  if (patternLines.length) {
    chunks.push(`דפוסי קושי / כשל חוזר:\n${patternLines.join('\n')}`);
  }

  return chunks.join('\n\n');
}
