/**
 * התחייבות זמנית מהצ'אט — "אמשיך מחר", "עוד שעה" — לבדיקה חברית מאלמוג.
 */

import { israelDateKey } from './onboarding-check-in-time';
import type { AiUserContext } from './memory';
import { updateAiContext } from './memory';

const IL_TZ = 'Asia/Jerusalem';
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

export type JourneyFollowUp = {
  check_at: string;
  promised_at: string;
  label: string;
  step_id?: string;
};

const PROMISE_RE =
  /(?:אמשיך|נמשיך|אכנס|נכנס|אעשה|נעשה|אסיים|ניגש|אחזור|נחזור|אתחיל|נתחיל|אקרא|אספיק)/i;

const CANCEL_RE =
  /(?:לא\s+(?:אמשיך|נמשיך|מחר)|ביטלתי|דחיתי|לא\s+היום|לא\s+עכשיו|שכחתי\s+מזה)/i;

function addIsraelCalendarDays(dateKey: string, days: number): string {
  const anchor = new Date(`${dateKey}T12:00:00+02:00`);
  return israelDateKey(new Date(anchor.getTime() + days * DAY_MS));
}

function isoAtIsraelLocal(dateKey: string, hhmm: string): string {
  for (const offset of ['+03:00', '+02:00']) {
    const iso = `${dateKey}T${hhmm}:00${offset}`;
    const d = new Date(iso);
    if (israelDateKey(d) === dateKey) return d.toISOString();
  }
  return new Date(`${dateKey}T${hhmm}:00+02:00`).toISOString();
}

function shortLabel(intent: string): string {
  switch (intent) {
    case 'hour':
      return 'המשך בעוד שעה';
    case 'hours2':
      return 'המשך בעוד שעתיים';
    case 'tonight':
      return 'המשך הערב';
    case 'tomorrow_evening':
      return 'המשך מחר בערב';
    case 'tomorrow_morning':
    default:
      return 'המשך מחר';
  }
}

/** מחלץ זמן בדיקה מהודעת משתמש — null אם אין התחייבות ברורה. */
export function parseJourneyFollowUpFromMessage(
  message: string,
  stepId?: string | null,
  now = new Date()
): JourneyFollowUp | null {
  const msg = message.replace(/\s+/g, ' ').trim();
  if (msg.length < 4 || CANCEL_RE.test(msg)) return null;

  const hasPromiseVerb = PROMISE_RE.test(msg);
  const hourMatch = msg.match(/(?:עוד|בעוד)\s*(?:שעה|שעה\s*אחת)(?!\s*ו)/i);
  const hours2Match = msg.match(/(?:עוד|בעוד)\s*שעתיים/i);
  const hoursNMatch = msg.match(/(?:עוד|בעוד)\s*(\d{1,2})\s*שעות?/i);
  const tomorrowMatch = /מחר/i.test(msg);
  const tonightMatch = /(?:היום|הערב)\s*(?:בערב)?|בערב\s*(?:היום)?/i.test(msg);

  let intent: string | null = null;
  let checkAt: Date | null = null;

  if (hourMatch) {
    intent = 'hour';
    checkAt = new Date(now.getTime() + HOUR_MS);
  } else if (hours2Match) {
    intent = 'hours2';
    checkAt = new Date(now.getTime() + 2 * HOUR_MS);
  } else if (hoursNMatch) {
    const n = Math.min(12, Math.max(1, Number.parseInt(hoursNMatch[1]!, 10)));
    intent = 'hour';
    checkAt = new Date(now.getTime() + n * HOUR_MS);
  } else if (tomorrowMatch || (hasPromiseVerb && /מחר/i.test(msg))) {
    const evening = /מחר\s*בערב|בערב\s*מחר/i.test(msg);
    intent = evening ? 'tomorrow_evening' : 'tomorrow_morning';
    const tomorrow = addIsraelCalendarDays(israelDateKey(now), 1);
    checkAt = new Date(isoAtIsraelLocal(tomorrow, evening ? '19:00' : '10:00'));
  } else if (tonightMatch && hasPromiseVerb) {
    intent = 'tonight';
    const today = israelDateKey(now);
    const target = new Date(isoAtIsraelLocal(today, '19:00'));
    checkAt = target.getTime() > now.getTime() ? target : new Date(now.getTime() + 3 * HOUR_MS);
  } else if (hasPromiseVerb && /(?:אחרי|בסוף)\s*(?:ה)?(?:יום|עבודה|משמרת)/i.test(msg)) {
    intent = 'tonight';
    checkAt = new Date(now.getTime() + 4 * HOUR_MS);
  }

  if (!intent || !checkAt) return null;

  const maxAhead = now.getTime() + 3 * DAY_MS;
  if (checkAt.getTime() > maxAhead) return null;

  return {
    check_at: checkAt.toISOString(),
    promised_at: now.toISOString(),
    label: shortLabel(intent),
    ...(stepId ? { step_id: stepId } : {}),
  };
}

export function isJourneyFollowUpDue(
  followUp: JourneyFollowUp | null | undefined,
  now = Date.now(),
  windowMinutes = 35
): boolean {
  if (!followUp?.check_at) return false;
  const at = new Date(followUp.check_at).getTime();
  if (!Number.isFinite(at)) return false;
  const win = windowMinutes * 60 * 1000;
  return now >= at - 5 * 60 * 1000 && now <= at + win;
}

export function formatJourneyFollowUpPromptBlock(followUp: JourneyFollowUp): string {
  const when = new Date(followUp.check_at).toLocaleString('he-IL', {
    timeZone: IL_TZ,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  return `הבטחה מהשיחה (${followUp.label}, ~${when}): בדוק בעדינות אם זה קרה — "איך הלך?" לא "למה לא". אם לא — מה חסם, בלי שיפוט.`;
}

export async function applyJourneyFollowUpFromUserMessage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  message: string,
  stepId?: string | null
): Promise<{ stored: boolean; cleared: boolean }> {
  if (CANCEL_RE.test(message)) {
    await updateAiContext(supabase, userId, { journey_follow_up: null as unknown as undefined });
    return { stored: false, cleared: true };
  }

  const parsed = parseJourneyFollowUpFromMessage(message, stepId);
  if (!parsed) return { stored: false, cleared: false };

  await updateAiContext(supabase, userId, { journey_follow_up: parsed });
  return { stored: true, cleared: false };
}

export async function clearJourneyFollowUp(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string
): Promise<void> {
  await updateAiContext(supabase, userId, { journey_follow_up: null as unknown as undefined });
}

/** שורה קצרה לפרומפט הצ'אט — כשיש הבטחה פעילה. */
export function formatJourneyFollowUpChatBlock(ctx: AiUserContext | null | undefined): string {
  const f = readJourneyFollowUp(ctx);
  if (!f) return '';
  return `\nהבטחה מהשיחה: ${f.label} (~${f.check_at}). אם המשתמש/ת דוחה/מבטל/מעדכן זמן — התאם בטבעיות; אל תזכיר "שמרתי" או מערכת.\n`;
}

export function readJourneyFollowUp(ctx: AiUserContext | null | undefined): JourneyFollowUp | null {
  const raw = ctx?.journey_follow_up;
  if (!raw || typeof raw !== 'object') return null;
  const f = raw as JourneyFollowUp;
  if (typeof f.check_at !== 'string' || typeof f.label !== 'string') return null;
  return f;
}
