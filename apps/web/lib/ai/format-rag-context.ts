import { rankUserMemoryQueryHits, type RankMemoryOptions } from './memory-ranking';
import type { QueryHit } from './upstash-vector-rest';

const CATEGORY_LABEL: Record<string, string> = {
  strength: 'חוזק',
  weakness: 'חולשה',
  success: 'הצלחה',
  failure: 'כשל',
  schedule: 'לו״ז / התחייבות',
  goal: 'יעד',
  task_completed: 'משימה שהושלמה',
  task_missed: 'משימה שפוספסה',
  task_partial: 'משימה חלקית',
  habit: 'הרגל',
  trigger: 'טריגר',
  motivation: 'מוטיבציה',
  resistance: 'התנגדות',
  personal: 'הקשר אישי',
  health: 'בריאות',
  psychology: 'פסיכולוגיה',
  coaching: 'סגנון ליווי',
  risk: 'סיכון',
  preference: 'העדפה',
  timeline: 'ציר זמן',
  insight: 'תובנה',
  breakthrough: 'שבירה',
};

/** קטגוריות שמתאימות יותר ל"דפוסים" מאשר לאירוע חד-פעמי */
const PATTERN_CATEGORIES = new Set<string>([
  'weakness',
  'failure',
  'task_missed',
  'trigger',
  'resistance',
  'risk',
]);

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
 * טקסט להזרקה ל-system prompt.
 *
 * הבחירה נעשית ע"י מנוע הדירוג החכם (`rankUserMemoryQueryHits`): רלוונטיות
 * סמנטית + עומק התובנה + טריות, עם סף רעש ופיזור קטגוריות. רק אחרי שנבחרו
 * הפריטים הרלוונטיים באמת — מקבצים אותם לתצוגה (תובנות / מוקד עדכני / דפוסים).
 */
export function formatRagMemoryContextBlock(
  hits: QueryHit[],
  maxItems = 3,
  opts: Omit<RankMemoryOptions, 'maxItems'> = {}
): string {
  const ranked = rankUserMemoryQueryHits(hits, { ...opts, maxItems });
  if (!ranked.length) return '';

  const patternLines: string[] = [];
  const recentLines: string[] = [];
  const insightLines: string[] = [];

  for (const m of ranked) {
    const label = CATEGORY_LABEL[m.category] ?? m.category;
    const hint = formatUpdatedHint(m.lastSeenAt ?? m.updatedAt);
    const suffix = hint ? ` (עודכן ${hint})` : '';
    const isInsight = m.isInsight || m.memoryLevel >= 3;
    const tag = isInsight ? 'תובנה' : label;
    const line = `- (${tag}) ${m.text}${suffix}`;
    if (isInsight) {
      insightLines.push(line);
    } else if (PATTERN_CATEGORIES.has(m.category)) {
      patternLines.push(line);
    } else {
      recentLines.push(line);
    }
  }

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
