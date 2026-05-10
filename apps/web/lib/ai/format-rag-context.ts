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

  let n = 0;
  for (const h of hits) {
    if (n >= maxItems) break;
    const meta = h.metadata;
    if (!isMemoryMeta(meta)) continue;
    const label = CATEGORY_LABEL[meta.category] ?? meta.category;
    const hint = formatUpdatedHint(meta.updatedAt);
    const suffix = hint ? ` (עודכן ${hint})` : '';
    const line = `- (${label}) ${meta.text}${suffix}`;
    if (PATTERN_CATEGORIES.has(meta.category)) {
      patternLines.push(line);
    } else {
      recentLines.push(line);
    }
    n += 1;
  }

  if (!patternLines.length && !recentLines.length) return '';

  const chunks: string[] = [];
  chunks.push(
    'זיכרון רלוונטי משיחות קודמות (שליפה סמנטית לפי ההודעה הנוכחית — רמזים בלבד, לא רשימה מלאה):'
  );
  if (recentLines.length) {
    chunks.push(`מוקד עדכני / הצלחות / לו״ז:\n${recentLines.join('\n')}`);
  }
  if (patternLines.length) {
    chunks.push(`דפוסי קושי / כשל חוזר:\n${patternLines.join('\n')}`);
  }

  return chunks.join('\n\n');
}
