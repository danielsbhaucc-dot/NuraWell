import type { SupabaseClient } from '@supabase/supabase-js';
import { isAvoidPushActive } from '../ai/avoid-push';
import {
  isJourneyFollowUpDue,
  readJourneyFollowUp,
} from '../ai/journey-follow-up-promise';
import type { AiUserContext } from '../ai/memory';
import { fetchJourneyCompanionContext } from './journey-companion';
import { sendJourneyCompanionNudge } from './send-journey-companion-nudge';

const IL_TZ = 'Asia/Jerusalem';

/** חלון השעות שמותר לשלוח התראה (שעון ישראל). */
const NUDGE_HOUR_START = 9; // 09:00
const NUDGE_HOUR_END = 22; // לפני 22:00

type ProfileRow = {
  id: string;
  onboarding_completed: boolean | null;
  created_at: string;
  ai_context: Record<string, unknown> | null;
};

export type KickoffEligibility =
  | { ok: true; deferUntilIso: string | null }
  | { ok: false; reason: string };

function israelHourNow(now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: IL_TZ,
    hour: '2-digit',
    hour12: false,
  }).formatToParts(now);
  return Number.parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);
}

/**
 * חישוב הזמן הבא שבו מותר לשלוח התראה (09:00 ישראל הקרוב).
 * אם השעה הנוכחית בחלון — מחזיר null (אפשר עכשיו).
 */
function computeDeferUntilIso(now: Date = new Date()): string | null {
  const hour = israelHourNow(now);
  if (hour >= NUDGE_HOUR_START && hour < NUDGE_HOUR_END) {
    return null;
  }

  /** מחר 09:00 שעון ישראל. אם השעה < 09 — היום, אחרת מחר. */
  const dateParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: IL_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

  const baseDate = hour < NUDGE_HOUR_START ? dateParts : addOneIsraelDay(dateParts);
  const target = new Date(`${baseDate}T09:00:00+03:00`);
  if (!Number.isFinite(target.getTime())) {
    return new Date(now.getTime() + 6 * 60 * 60 * 1000).toISOString();
  }
  return target.toISOString();
}

function addOneIsraelDay(dateKey: string): string {
  const anchor = new Date(`${dateKey}T12:00:00+03:00`);
  anchor.setUTCDate(anchor.getUTCDate() + 1);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: IL_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(anchor);
}

/**
 * בודק האם מותר לשלוח kickoff עכשיו עבור המשתמש.
 * החזרות:
 *  - ok=true, deferUntilIso=null      → שלח עכשיו
 *  - ok=true, deferUntilIso=ISO       → סלפ עד הזמן ההוא ובדוק שוב
 *  - ok=false, reason='...'           → דלג
 */
export async function checkKickoffEligibility(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any, any, any>,
  userId: string
): Promise<KickoffEligibility> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile, error: profErr } = await (admin as any)
    .from('profiles')
    .select('id, onboarding_completed, created_at, ai_context')
    .eq('id', userId)
    .maybeSingle();

  if (profErr) return { ok: false, reason: `db_error:${profErr.message}` };
  if (!profile) return { ok: false, reason: 'no_profile' };

  const row = profile as ProfileRow;
  if (!row.onboarding_completed) {
    return { ok: false, reason: 'onboarding_incomplete' };
  }

  const rawCtx = (row.ai_context ?? {}) as Record<string, unknown>;
  if (isAvoidPushActive(rawCtx)) {
    return { ok: false, reason: 'avoid_push_active' };
  }

  /**
   * אם המשתמש בשיחה הקודמת אמר "אצפה מחר" / "אעשה את זה הערב" — יש journey_follow_up
   * עם check_at עתידי. המסלול של ה-follow-up הוא מנגנון נפרד — לא לתקוע פה kickoff.
   */
  const followUp = readJourneyFollowUp(rawCtx as AiUserContext);
  if (followUp && !isJourneyFollowUpDue(followUp)) {
    return { ok: false, reason: 'journey_follow_up_pending' };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: progress } = await (admin as any)
    .from('journey_progress')
    .select('step_id, video_watched, is_completed')
    .eq('user_id', userId)
    .limit(5);

  const progressRows = (progress ?? []) as Array<{
    step_id: string;
    video_watched: boolean | null;
    is_completed: boolean | null;
  }>;

  /** משתמש שפתח שיעור או סיים צעד — לא צריך kickoff, יש מסלולי ליווי אחרים. */
  const touched = progressRows.some((r) => r.video_watched === true || r.is_completed === true);
  if (touched) {
    return { ok: false, reason: 'journey_already_started' };
  }

  /** למניעת כפל — אם כבר נשלח kickoff ב-24 השעות האחרונות, לדלג. */
  const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: recentNotifs } = await (admin as any)
    .from('notifications')
    .select('id, metadata')
    .eq('user_id', userId)
    .eq('type', 'ai_message')
    .gte('created_at', sinceIso)
    .limit(40);

  for (const r of (recentNotifs ?? []) as Array<{ metadata?: { journey_kickoff?: boolean } }>) {
    if (r.metadata?.journey_kickoff === true) {
      return { ok: false, reason: 'kickoff_already_sent_recently' };
    }
  }

  return { ok: true, deferUntilIso: computeDeferUntilIso() };
}

/**
 * שולח את ה-kickoff בפועל — משתמש ב-pipeline הקיים של אלמוג כדי שהטון יישאר אנושי.
 */
export async function sendKickoffNudgeForUser(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any, any, any>,
  userId: string
): Promise<{ inserted: boolean; reason?: string }> {
  const companion = await fetchJourneyCompanionContext(admin, userId);
  if (!companion) {
    return { inserted: false, reason: 'no_journey_context' };
  }
  if (companion.phase !== 'not_started' && companion.phase !== 'step_not_opened') {
    return { inserted: false, reason: `unexpected_phase:${companion.phase}` };
  }

  const result = await sendJourneyCompanionNudge(admin, userId, companion);
  if (!result?.inserted) {
    return { inserted: false, reason: 'send_failed' };
  }

  /** שם פרטי לצורך push — נחלץ דרך כותרת הnotification עצמו (כבר מחזיק שם). */
  const inserted = result.inserted as { title?: string } | null;
  const title = inserted?.title ?? 'אלמוג';

  const { afterAlmogInAppNotification } = await import('../notifications/after-almog-insert');
  afterAlmogInAppNotification(userId, title, result.body);

  return { inserted: true };
}
