/**
 * העדפת "פחות דחיפה" — קבועה (avoid_push) או השהייה זמנית אחרי משבר (avoid_push_until).
 *
 * חוסם *רק* Web Push למכשיר (דפדפן). התראות in-app בפעמון וה-cron של
 * habit-checkpoints ממשיכים לעבוד — המשתמש עדיין מקבל תזכורות על משימות.
 */

import type { AiUserContext } from './memory';

const DEFAULT_CRISIS_COOLDOWN_HOURS = 48;

export function isAvoidPushActive(ctx: Record<string, unknown> | null | undefined): boolean {
  if (!ctx) return false;
  if (ctx.avoid_push === true) return true;
  const until = ctx.avoid_push_until;
  if (typeof until === 'string' && until.trim()) {
    const ms = new Date(until).getTime();
    if (Number.isFinite(ms) && Date.now() < ms) return true;
  }
  return false;
}

export function crisisCooldownUntilIso(hours = DEFAULT_CRISIS_COOLDOWN_HOURS): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

/** עדכון לשילוב ב-ai_context אחרי נוטיפיקציית משבר — לא נוגע ב-avoid_push הקבוע. */
export function buildCrisisCooldownPatch(hours = DEFAULT_CRISIS_COOLDOWN_HOURS): Pick<
  AiUserContext,
  'avoid_push_until'
> {
  return { avoid_push_until: crisisCooldownUntilIso(hours) };
}

/** מסיר avoid_push_until שפג תוקף (למיזוג פרופיל). */
export function pruneExpiredAvoidPushUntil(ctx: AiUserContext): AiUserContext {
  const until = ctx.avoid_push_until;
  if (!until || typeof until !== 'string') return ctx;
  const ms = new Date(until).getTime();
  if (!Number.isFinite(ms) || Date.now() >= ms) {
    const { avoid_push_until: _removed, ...rest } = ctx;
    return rest;
  }
  return ctx;
}
