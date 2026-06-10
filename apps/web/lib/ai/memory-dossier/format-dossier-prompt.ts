import type { UserMemoryDossier } from './types';
import { EMPTY_DOSSIER } from './types';

type DossierPromptOptions = {
  /** ההודעה הנוכחית של המשתמש — מאפשרת לבחור מהתיק רק את מה שרלוונטי עכשיו. */
  query?: string | null;
  maxLines?: number;
  now?: Date;
};

type DossierLine = {
  section: string;
  text: string;
  /** חשיבות בסיסית של השורה גם בלי התאמה לשאלה הנוכחית. */
  priority: number;
  createdAt?: string;
};

const DEFAULT_MAX_DOSSIER_LINES = 8;
const DAY_MS = 24 * 60 * 60 * 1000;
const INSIGHT_HALF_LIFE_DAYS = 60;

const QUERY_STOPWORDS = new Set([
  'אני',
  'אתה',
  'את',
  'הוא',
  'היא',
  'זה',
  'זו',
  'של',
  'על',
  'עם',
  'אבל',
  'וגם',
  'כי',
  'לא',
  'כן',
  'מה',
  'איך',
  'לי',
  'שלי',
  'אותי',
  'אותך',
]);

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function asStringList(obj: Record<string, unknown>, key: string, max = 3): string[] {
  const raw = obj[key];
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    .map((x) => x.replace(/\s+/g, ' ').trim())
    .slice(0, max);
}

function tokenizeHebrewish(text: string | null | undefined): Set<string> {
  if (!text) return new Set();
  const tokens = text
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !QUERY_STOPWORDS.has(t));
  return new Set(tokens);
}

function lexicalRelevance(queryTokens: Set<string>, text: string): number {
  if (queryTokens.size === 0) return 0;
  const textTokens = tokenizeHebrewish(text);
  if (textTokens.size === 0) return 0;
  let overlap = 0;
  for (const token of queryTokens) {
    if (textTokens.has(token)) overlap += 1;
  }
  return Math.min(1, overlap / Math.min(queryTokens.size, 6));
}

function recencyBoost(createdAt: string | undefined, now: Date): number {
  if (!createdAt) return 0;
  const t = new Date(createdAt).getTime();
  if (!Number.isFinite(t)) return 0;
  const ageDays = Math.max(0, (now.getTime() - t) / DAY_MS);
  return Math.pow(0.5, ageDays / INSIGHT_HALF_LIFE_DAYS);
}

function rankDossierLines(lines: DossierLine[], opts: Required<DossierPromptOptions>): DossierLine[] {
  const queryTokens = tokenizeHebrewish(opts.query);
  return [...lines]
    .map((line, index) => ({
      line,
      index,
      score:
        line.priority +
        lexicalRelevance(queryTokens, line.text) * 0.45 +
        recencyBoost(line.createdAt, opts.now) * 0.12,
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, opts.maxLines)
    .map((x) => x.line);
}

/**
 * בלוק דחוס לפרומפט הצ'אט — בוחר את השורות הכי רלוונטיות, לא JSON גולמי.
 */
export function formatUserMemoryDossierPromptBlock(
  dossier: UserMemoryDossier | null | undefined,
  options: DossierPromptOptions = {}
): string | null {
  if (!dossier) return null;

  const opts: Required<DossierPromptOptions> = {
    query: options.query ?? '',
    maxLines: options.maxLines ?? DEFAULT_MAX_DOSSIER_LINES,
    now: options.now ?? new Date(),
  };
  const candidates: DossierLine[] = [];

  if (dossier.tags.length > 0) {
    candidates.push({
      section: 'תגיות',
      text: dossier.tags.slice(0, 10).join(' · '),
      priority: 0.25,
    });
  }

  const primaryGoal =
    asString(dossier.goals.primary) ??
    asString(dossier.essentials.primary_goal) ??
    asString(dossier.goals.main);
  if (primaryGoal) candidates.push({ section: 'יעד מרכזי', text: primaryGoal, priority: 0.95 });

  const currentFocus = asString(dossier.essentials.current_focus);
  if (currentFocus) candidates.push({ section: 'פוקוס', text: currentFocus, priority: 0.85 });

  const completed = asStringList(dossier.task_memory, 'completed_recent', 2);
  if (completed.length) {
    candidates.push({ section: 'הצלחות אחרונות', text: completed.join(' · '), priority: 0.55 });
  }

  const missed = asStringList(dossier.task_memory, 'missed_recent', 2);
  if (missed.length) {
    candidates.push({ section: 'פספוסים אחרונים', text: missed.join(' · '), priority: 0.58 });
  }

  const missReasons = asStringList(dossier.task_memory, 'miss_reasons', 2);
  if (missReasons.length) {
    candidates.push({ section: 'סיבות פספוס', text: missReasons.join(' · '), priority: 0.62 });
  }

  const triggers = asStringList(dossier.habit_memory, 'triggers', 2);
  if (triggers.length) candidates.push({ section: 'טריגרים', text: triggers.join(' · '), priority: 0.66 });

  const weakTimes = asStringList(dossier.habit_memory, 'weak_times', 2);
  if (weakTimes.length) {
    candidates.push({ section: 'שעות חלשות', text: weakTimes.join(' · '), priority: 0.56 });
  }

  const motivation = asString(dossier.psychology.motivation);
  if (motivation) candidates.push({ section: 'מוטיבציה', text: motivation, priority: 0.6 });

  const resistance = asString(dossier.psychology.resistance);
  if (resistance) candidates.push({ section: 'התנגדות', text: resistance, priority: 0.65 });

  const toneWorks = asString(dossier.coaching_profile.tone_works);
  if (toneWorks) candidates.push({ section: 'טון שעובד', text: toneWorks, priority: 0.5 });

  const dropout = asString(dossier.risk_signals.dropout_risk);
  if (dropout && dropout !== 'low') {
    candidates.push({ section: 'סיכון נטישה', text: dropout, priority: 0.72 });
  }

  for (const insight of dossier.inferred_insights.slice(-8)) {
    const text = asString(insight.text);
    if (!text) continue;
    const confidence = typeof insight.confidence === 'number' ? Math.max(0, Math.min(1, insight.confidence)) : 0.7;
    candidates.push({
      section: 'תובנה',
      text: text.slice(0, 180),
      priority: 0.74 + confidence * 0.16,
      createdAt: insight.created_at,
    });
  }

  const selected = rankDossierLines(candidates, opts);
  if (selected.length === 0) return null;

  const lines: string[] = ['[תיק זיכרון מובנה — מדורג לפי רלוונטיות]'];
  for (const line of selected) {
    lines.push(`${line.section}: ${line.text}`);
  }
  lines.push('השתמש בזה בעדינות; אל תציג רשימת דאטה ואל תאמר "אני רואה בתיק".');
  return lines.join('\n');
}

export function rowToDossier(row: Record<string, unknown> | null, userId: string): UserMemoryDossier | null {
  if (!row) return null;
  const empty = EMPTY_DOSSIER();
  return {
    user_id: userId,
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : empty.tags,
    essentials: (row.essentials as Record<string, unknown>) ?? empty.essentials,
    goals: (row.goals as Record<string, unknown>) ?? empty.goals,
    task_memory: (row.task_memory as Record<string, unknown>) ?? empty.task_memory,
    habit_memory: (row.habit_memory as Record<string, unknown>) ?? empty.habit_memory,
    schedule_memory: (row.schedule_memory as Record<string, unknown>) ?? empty.schedule_memory,
    personal_context: (row.personal_context as Record<string, unknown>) ?? empty.personal_context,
    health_context: (row.health_context as Record<string, unknown>) ?? empty.health_context,
    psychology: (row.psychology as Record<string, unknown>) ?? empty.psychology,
    coaching_profile: (row.coaching_profile as Record<string, unknown>) ?? empty.coaching_profile,
    risk_signals: (row.risk_signals as Record<string, unknown>) ?? empty.risk_signals,
    inferred_insights: Array.isArray(row.inferred_insights)
      ? (row.inferred_insights as UserMemoryDossier['inferred_insights'])
      : empty.inferred_insights,
    source_stats: (row.source_stats as Record<string, unknown>) ?? empty.source_stats,
    updated_at: typeof row.updated_at === 'string' ? row.updated_at : undefined,
  };
}
