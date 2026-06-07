/**
 * עדכוני DB ל-ai_context.reengagement (מערכת הנטישה):
 *   - readReengagementContext  — קריאה מנורמלת (sent_moves תמיד מערך).
 *   - patchReengagementContext — מסמן move כ-"נשלח" + timestamp.
 *   - resetReengagementContext — איפוס מחזור (reactivation).
 *   - markExitSurveyAnswered   — סימון שהמשתמש השיב לסקר.
 *   - patchPassiveTouch        — רישום touch פסיבי (passive presence cron).
 *
 * נקרא מ-service-role (Worker / cron) וגם מ-client session (markExitSurveyAnswered).
 */

import {
  reengagementSentAtKey,
  type ReengagementMove,
} from './reengagement-moves';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = any;

/** הצורה הנשמרת תחת profiles.ai_context.reengagement (sent_moves תמיד מערך אחרי read). */
export type ReengagementContext = {
  sent_moves: ReengagementMove[];
  open_door_sent_at?: string;
  mini_task_sent_at?: string;
  fresh_start_offered_at?: string;
  fresh_start_accepted_at?: string;
  identity_sent_at?: string;
  breakup_sent_at?: string;
  exit_survey_answered_at?: string;
  last_passive_soft_at?: string;
  last_passive_value_at?: string;
  last_passive_trigger_at?: string;
  pause_offered_at?: string;
  pause_accepted_at?: string;
};

/** קריאה בטוחה ומנורמלת של reengagement context מתוך ai_context. */
export function readReengagementContext(
  aiContext: Record<string, unknown> | null | undefined
): ReengagementContext {
  const raw = (aiContext ?? {}) as Record<string, unknown>;
  const reng = raw.reengagement;
  if (!reng || typeof reng !== 'object' || Array.isArray(reng)) {
    return { sent_moves: [] };
  }
  const obj = reng as Record<string, unknown>;
  const sent = Array.isArray(obj.sent_moves)
    ? (obj.sent_moves as ReengagementMove[])
    : [];
  return { ...(obj as ReengagementContext), sent_moves: sent };
}

/** רשימת ה-moves שכבר נשלחו (לצורך dedup ב-planner). */
export function sentMovesFromContext(
  aiContext: Record<string, unknown> | null | undefined
): ReengagementMove[] {
  return readReengagementContext(aiContext).sent_moves;
}

/**
 * מסמן move כ-"נשלח": מוסיף ל-sent_moves (dedup) + רושם timestamp ייעודי.
 * Read-modify-write על profiles.ai_context (ה-JSONB משותף, אז ממזגים).
 */
export async function patchReengagementContext(
  admin: Db,
  userId: string,
  move: ReengagementMove,
  now = new Date()
): Promise<void> {
  if (move === 'none') return;
  try {
    const { data } = await admin
      .from('profiles')
      .select('ai_context')
      .eq('id', userId)
      .maybeSingle();

    const ctx = (data?.ai_context ?? {}) as Record<string, unknown>;
    const reng = readReengagementContext(ctx);

    const sent = new Set<ReengagementMove>(reng.sent_moves);
    sent.add(move);

    const nextReng: ReengagementContext = { ...reng, sent_moves: [...sent] };

    const tsKey = reengagementSentAtKey(move);
    if (tsKey) {
      (nextReng as Record<string, unknown>)[tsKey] = now.toISOString();
    }

    await admin
      .from('profiles')
      .update({ ai_context: { ...ctx, reengagement: nextReng } })
      .eq('id', userId);
  } catch (e) {
    console.warn('[reengagement] patch context failed', {
      userId,
      move,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

/**
 * איפוס מחזור ה-re-engagement (reactivation): מנקה sent_moves + timestamps של
 * המהלכים כדי שאם המשתמש ינטוש שוב בעתיד — המחזור יתחיל מ-open_door מחדש.
 * שומר את exit_survey_answered_at לאנליטיקס.
 */
export function resetReengagementContext(
  prev: ReengagementContext
): ReengagementContext {
  const next: ReengagementContext = { sent_moves: [] };
  if (prev.exit_survey_answered_at) {
    next.exit_survey_answered_at = prev.exit_survey_answered_at;
  }
  return next;
}

/** סימון שהמשתמש השיב לסקר ה-Exit (נקרא מ-API churn-feedback, client session). */
export async function markExitSurveyAnswered(
  db: Db,
  userId: string,
  now = new Date()
): Promise<void> {
  try {
    const { data } = await db
      .from('profiles')
      .select('ai_context')
      .eq('id', userId)
      .maybeSingle();
    const ctx = (data?.ai_context ?? {}) as Record<string, unknown>;
    const reng = readReengagementContext(ctx);
    const nextReng: ReengagementContext = {
      ...reng,
      exit_survey_answered_at: now.toISOString(),
    };
    await db
      .from('profiles')
      .update({ ai_context: { ...ctx, reengagement: nextReng } })
      .eq('id', userId);
  } catch (e) {
    console.warn('[reengagement] mark exit survey answered failed', {
      userId,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

/**
 * רישום timestamp של touch פסיבי (passive presence). שומר את ה-last_passive_*_at
 * המתאים — לאכיפת קצב ה-value drop (30 יום) וה-trigger (14 יום).
 */
export async function patchPassiveTouch(
  admin: Db,
  userId: string,
  kind: 'soft' | 'value' | 'trigger',
  now = new Date()
): Promise<void> {
  try {
    const { data } = await admin
      .from('profiles')
      .select('ai_context')
      .eq('id', userId)
      .maybeSingle();
    const ctx = (data?.ai_context ?? {}) as Record<string, unknown>;
    const reng = readReengagementContext(ctx);
    const key =
      kind === 'soft'
        ? 'last_passive_soft_at'
        : kind === 'value'
          ? 'last_passive_value_at'
          : 'last_passive_trigger_at';
    const nextReng: ReengagementContext = { ...reng, [key]: now.toISOString() };
    await admin
      .from('profiles')
      .update({ ai_context: { ...ctx, reengagement: nextReng } })
      .eq('id', userId);
  } catch (e) {
    console.warn('[reengagement] patch passive touch failed', {
      userId,
      kind,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
