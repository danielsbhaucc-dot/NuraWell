/**
 * churn/update-engagement-status.ts
 * ---------------------------------
 * עדכון persisted של `profiles.engagement_status` (ספק 5.4 + 6.5), כולל
 * reactivation reset: אם משתמש חזר ל-active אחרי שקיבל מהלכי re-engagement,
 * מנקים את `ai_context.reengagement.sent_moves` כדי שהמחזור יתחיל מחדש.
 *
 * נקרא מ-cron habit-checkpoints אחרי תכנון, על כל המשתמשים שחושב להם
 * last-active. כותב רק כשיש שינוי (חוסך writes).
 */

import { daysBetween } from '../workflows/habit-checkpoint-batch';
import { computeEngagementStatus, type EngagementStatus } from './reengagement-moves';
import { readReengagementContext, type ReengagementContext } from './patch-reengagement-context';

/**
 * מאפס מצב re-engagement אחרי reactivation — מנקה sent_moves ושומר היסטוריה
 * ב-sent_moves_archive (ספק 3.4 §3). מוגדר מקומית כדי לא להיות תלוי בליבה.
 *
 * 🔑 קריטי: בונים אובייקט חדש ולכן מנקים גם את כל ה-*_sent_at — בעיקר את
 * `breakup_sent_at`. ב-planner יש `if (breakupDone) continue` שמשתיק את ערוץ
 * ה-habit-checkpoint לצמיתות כל עוד `breakup_sent_at` קיים. בלי לנקות אותו,
 * משתמש שחזר להיות פעיל לא היה חוזר לדרבון לעולם. שומרים רק את
 * `exit_survey_answered_at` לאנליטיקס.
 */
function resetReengagementContext(prev: ReengagementContext): Record<string, unknown> {
  const prevArchive = Array.isArray((prev as Record<string, unknown>).sent_moves_archive)
    ? ((prev as Record<string, unknown>).sent_moves_archive as string[])
    : [];
  const archive = [...prevArchive, ...(prev.sent_moves ?? [])].slice(-50);
  const next: Record<string, unknown> = { sent_moves: [], sent_moves_archive: archive };
  const surveyAnsweredAt = (prev as Record<string, unknown>).exit_survey_answered_at;
  if (typeof surveyAnsweredAt === 'string') {
    next.exit_survey_answered_at = surveyAnsweredAt;
  }
  return next;
}

export type EngagementProfileRow = {
  id: string;
  engagement_status?: string | null;
  ai_context?: Record<string, unknown> | null;
};

export type UpdateEngagementResult = {
  updated: number;
  reactivated: number;
  errors: string[];
};

/**
 * מעדכן engagement_status לכל הפרופילים לפי daysSinceLastActive, ומאפס מצב
 * re-engagement כשמשתמש חזר ל-active. מגביל מספר writes ל-cap סביר.
 */
export async function updateEngagementStatuses(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  params: {
    profileRows: EngagementProfileRow[];
    lastActiveByUser: ReadonlyMap<string, string | null>;
    now?: Date;
    maxWrites?: number;
  }
): Promise<UpdateEngagementResult> {
  const { profileRows, lastActiveByUser } = params;
  const now = params.now ?? new Date();
  const maxWrites = Math.max(1, Math.min(5000, params.maxWrites ?? 2000));

  let updated = 0;
  let reactivated = 0;
  const errors: string[] = [];

  const nowIso = now.toISOString();

  for (const row of profileRows) {
    if (updated >= maxWrites) break;
    const days = daysBetween(lastActiveByUser.get(row.id) ?? null, now);
    const status: EngagementStatus = computeEngagementStatus(days);
    const prevStatus = (row.engagement_status ?? null) as string | null;

    const reCtx = readReengagementContext(row.ai_context);
    const hasSentMoves = (reCtx.sent_moves?.length ?? 0) > 0;
    /**
     * גם אם sent_moves כבר התרוקן אך נשאר `breakup_sent_at` — חייבים לאפס,
     * אחרת ה-planner ימשיך להשתיק את הערוץ (`if (breakupDone) continue`).
     */
    const hasBreakup = Boolean((reCtx as Record<string, unknown>).breakup_sent_at);
    const shouldReactivate = status === 'active' && (hasSentMoves || hasBreakup);

    if (status === prevStatus && !shouldReactivate) continue;

    const patch: Record<string, unknown> = {};
    if (status !== prevStatus) {
      patch.engagement_status = status;
      patch.engagement_status_updated_at = nowIso;
    }
    if (shouldReactivate) {
      const aiContext = (row.ai_context ?? {}) as Record<string, unknown>;
      patch.ai_context = { ...aiContext, reengagement: resetReengagementContext(reCtx) };
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (admin as any).from('profiles').update(patch).eq('id', row.id);
      if (error) {
        errors.push(`${row.id}: ${error.message}`);
        continue;
      }
      updated += 1;
      if (shouldReactivate) reactivated += 1;
    } catch (e) {
      errors.push(`${row.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { updated, reactivated, errors };
}
