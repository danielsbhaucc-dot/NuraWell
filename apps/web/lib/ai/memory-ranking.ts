import { normalizeFactTextForDedupe } from './memory-fact-dedupe';
import type { QueryHit, UserMemoryVectorMetadata } from './upstash-vector-rest';

/**
 * דירוג זיכרון חכם — לב ה"חוכמה" של אלמוג.
 *
 * השליפה מ-Upstash מחזירה מועמדים לפי דמיון סמנטי בלבד. כאן אנחנו הופכים
 * "אוסף שנאסף" ל"מה שבאמת רלוונטי עכשיו" ע"י שקלול שלושה אותות:
 *   1. רלוונטיות סמנטית (score של Upstash) — האם זה קשור למה שהמשתמש אמר עכשיו.
 *   2. עומק התובנה (memoryLevel 2/3/4) — דפוס < תובנה < שבירה.
 *   3. טריות (recency) — זיכרון טרי שווה יותר מזיכרון בן חצי שנה.
 * בנוסף: סף רלוונטיות שמסנן רעש, ופיזור קטגוריות שמונע שורות חוזרות.
 */

export type RankableHit = {
  id: string;
  score: number;
  metadata?: UserMemoryVectorMetadata | Record<string, unknown>;
};

export type RankedMemory = {
  id: string;
  text: string;
  category: string;
  memoryLevel: 2 | 3 | 4;
  isInsight: boolean;
  updatedAt: string | undefined;
  firstSeenAt: string | undefined;
  lastSeenAt: string | undefined;
  seenCount: number;
  /** ציון רלוונטיות סמנטית גולמי מ-Upstash (0..1) */
  relevance: number;
  /** ציון מורכב סופי לאחר שקלול עומק + טריות */
  composite: number;
};

export type RankMemoryOptions = {
  /** כמה פריטים להחזיר בסוף */
  maxItems?: number;
  /** סף רלוונטיות מינימלי (score של Upstash) — מתחתיו הזיכרון נחשב רעש */
  minRelevance?: number;
  /** מקסימום פריטים מאותה קטגוריה — מונע 3 שורות "חולשה" שמשתיקות את השאר */
  maxPerCategory?: number;
  /** זמן ייחוס לחישוב טריות (לבדיקות) */
  now?: Date;
};

const DEFAULTS = {
  maxItems: 3,
  /**
   * סף שמרני: cosine ל-text-embedding-3-small בדרך כלל ~0.3+ לקשר רופף,
   * 0.5+ לקשר ברור. נשאר נמוך כדי לא לאבד זיכרון רלוונטי, אבל חותך רעש מובהק.
   */
  minRelevance: 0.32,
  maxPerCategory: 2,
};

/** משקלים לציון המורכב — רלוונטיות היא המלכה, עומק/טריות/חזרתיות מטים את הכף. */
const WEIGHT_RELEVANCE = 0.57;
const WEIGHT_DEPTH = 0.23;
const WEIGHT_RECENCY = 0.15;
const WEIGHT_REINFORCEMENT = 0.05;

/** חצי-חיים של טריות זיכרון (ימים) — אחרי ~45 יום ערך הטריות נחתך לחצי. */
const RECENCY_HALF_LIFE_DAYS = 45;
const DAY_MS = 24 * 60 * 60 * 1000;

function isMemoryMeta(m: unknown): m is UserMemoryVectorMetadata {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return false;
  const o = m as Record<string, unknown>;
  return typeof o.text === 'string' && typeof o.userId === 'string';
}

function metaLevel(meta: UserMemoryVectorMetadata): 2 | 3 | 4 {
  const lv = meta.memoryLevel;
  return lv === 2 || lv === 3 || lv === 4 ? lv : 2;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/** רכיב עומק: רמה 2→0, 3→0.5, 4→1. */
function depthComponent(level: 2 | 3 | 4): number {
  return (level - 2) / 2;
}

/** רכיב טריות: 1 לטרי, דועך אקספוננציאלית עם חצי-חיים. */
function recencyComponent(updatedAt: string | undefined, now: Date): number {
  if (!updatedAt) return 0.5; // ללא תאריך — ערך ביניים, לא ענישה מלאה
  const t = new Date(updatedAt).getTime();
  if (!Number.isFinite(t)) return 0.5;
  const ageDays = Math.max(0, (now.getTime() - t) / DAY_MS);
  return Math.pow(0.5, ageDays / RECENCY_HALF_LIFE_DAYS);
}

function reinforcementComponent(seenCount: number | undefined): number {
  if (!Number.isFinite(seenCount) || !seenCount || seenCount <= 1) return 0;
  return Math.min(1, Math.log2(seenCount + 1) / 4);
}

function compositeScore(
  relevance: number,
  level: 2 | 3 | 4,
  lastSeenAt: string | undefined,
  seenCount: number | undefined,
  now: Date
): number {
  return (
    WEIGHT_RELEVANCE * clamp01(relevance) +
    WEIGHT_DEPTH * depthComponent(level) +
    WEIGHT_RECENCY * recencyComponent(lastSeenAt, now) +
    WEIGHT_REINFORCEMENT * reinforcementComponent(seenCount)
  );
}

/**
 * דירוג מועמדי זיכרון: סינון רעש, שקלול מורכב, הסרת כפילויות, ופיזור קטגוריות.
 * מחזיר את הפריטים הטובים ביותר ממוינים לפי ציון מורכב יורד.
 */
export function rankMemoryHits(hits: RankableHit[], opts: RankMemoryOptions = {}): RankedMemory[] {
  const maxItems = opts.maxItems ?? DEFAULTS.maxItems;
  const minRelevance = opts.minRelevance ?? DEFAULTS.minRelevance;
  const maxPerCategory = opts.maxPerCategory ?? DEFAULTS.maxPerCategory;
  const now = opts.now ?? new Date();

  const scored: RankedMemory[] = [];
  for (const h of hits) {
    if (!isMemoryMeta(h.metadata)) continue;
    const meta = h.metadata;
    const text = meta.text.replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const relevance = clamp01(h.score);
    const level = metaLevel(meta);
    const lastSeenAt = meta.lastSeenAt ?? meta.updatedAt;
    const seenCount =
      typeof meta.seenCount === 'number' && Number.isFinite(meta.seenCount) ? Math.max(1, meta.seenCount) : 1;
    /**
     * סף רלוונטיות — אבל תובנות עמוקות (רמה 4) פטורות: שבירת-גבולות נשארת
     * זמינה גם כשהשיחה הנוכחית לא נוגעת בה ישירות.
     */
    if (relevance < minRelevance && level < 4) continue;
    scored.push({
      id: h.id,
      text,
      category: meta.category,
      memoryLevel: level,
      isInsight: Boolean(meta.isInsight) || level >= 3,
      updatedAt: meta.updatedAt,
      firstSeenAt: meta.firstSeenAt,
      lastSeenAt,
      seenCount,
      relevance,
      composite: compositeScore(relevance, level, lastSeenAt, seenCount, now),
    });
  }

  scored.sort((a, b) => b.composite - a.composite);

  const seenText = new Set<string>();
  const perCategory = new Map<string, number>();
  const selected: RankedMemory[] = [];

  for (const item of scored) {
    if (selected.length >= maxItems) break;
    const key = normalizeFactTextForDedupe(item.text);
    if (key && seenText.has(key)) continue;
    const catCount = perCategory.get(item.category) ?? 0;
    if (catCount >= maxPerCategory) continue;
    seenText.add(key);
    perCategory.set(item.category, catCount + 1);
    selected.push(item);
  }

  return selected;
}

/** עזר נוח: מקבל QueryHit[] של Upstash ומחזיר זיכרון מדורג. */
export function rankUserMemoryQueryHits(hits: QueryHit[], opts: RankMemoryOptions = {}): RankedMemory[] {
  return rankMemoryHits(hits as RankableHit[], opts);
}
