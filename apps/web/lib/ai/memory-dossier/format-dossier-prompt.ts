import type { UserMemoryDossier } from './types';
import { EMPTY_DOSSIER } from './types';

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

/**
 * בלוק דחוס לפרומפט הצ'אט — 10-20 שורות רלוונטיות, לא JSON גולמי.
 */
export function formatUserMemoryDossierPromptBlock(
  dossier: UserMemoryDossier | null | undefined
): string | null {
  if (!dossier) return null;

  const lines: string[] = ['[תיק זיכרון מובנה — Llama]'];

  if (dossier.tags.length > 0) {
    lines.push(`תגיות: ${dossier.tags.slice(0, 12).join(' · ')}`);
  }

  const primaryGoal =
    asString(dossier.goals.primary) ??
    asString(dossier.essentials.primary_goal) ??
    asString(dossier.goals.main);
  if (primaryGoal) lines.push(`יעד מרכזי: ${primaryGoal}`);

  const currentFocus = asString(dossier.essentials.current_focus);
  if (currentFocus) lines.push(`פוקוס: ${currentFocus}`);

  const completed = asStringList(dossier.task_memory, 'completed_recent', 2);
  if (completed.length) lines.push(`הצלחות אחרונות: ${completed.join(' · ')}`);

  const missed = asStringList(dossier.task_memory, 'missed_recent', 2);
  if (missed.length) lines.push(`פספוסים אחרונים: ${missed.join(' · ')}`);

  const missReasons = asStringList(dossier.task_memory, 'miss_reasons', 2);
  if (missReasons.length) lines.push(`סיבות פספוס: ${missReasons.join(' · ')}`);

  const triggers = asStringList(dossier.habit_memory, 'triggers', 2);
  if (triggers.length) lines.push(`טריגרים: ${triggers.join(' · ')}`);

  const weakTimes = asStringList(dossier.habit_memory, 'weak_times', 2);
  if (weakTimes.length) lines.push(`שעות חלשות: ${weakTimes.join(' · ')}`);

  const motivation = asString(dossier.psychology.motivation);
  if (motivation) lines.push(`מוטיבציה: ${motivation}`);

  const resistance = asString(dossier.psychology.resistance);
  if (resistance) lines.push(`התנגדות: ${resistance}`);

  const toneWorks = asString(dossier.coaching_profile.tone_works);
  if (toneWorks) lines.push(`טון שעובד: ${toneWorks}`);

  const dropout = asString(dossier.risk_signals.dropout_risk);
  if (dropout && dropout !== 'low') lines.push(`סיכון נטישה: ${dropout}`);

  const latestInsight = dossier.inferred_insights.at(-1)?.text;
  if (latestInsight) lines.push(`תובנה אחרונה: ${latestInsight.slice(0, 180)}`);

  if (lines.length === 1) return null;
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
