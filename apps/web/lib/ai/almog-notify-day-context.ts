import type { SupabaseClient } from '@supabase/supabase-js';

import type { HabitCheckpointSlot } from '../workflows/almog-habit-checkpoint-payload';

const SLOT_HE: Record<HabitCheckpointSlot, string> = {
  morning: 'בוקר',
  midday: 'צהריים',
  evening: 'ערב',
};

const ALMOG_NOTIFY_SOURCES = new Set([
  'almog_habit_checkpoint',
  'almog_personalized_check_in',
  'onboarding_check_in',
  'almog_followup_workflow',
  'cron_ops',
]);

export type TodayAlmogTouch = {
  slot: HabitCheckpointSlot | null;
  slotLabel: string;
  bodySnippet: string;
  sentAt: string;
  userRepliedSince: boolean;
};

/** אנרגיה לפי חלון יום — מוזרק לפרומפט נוטיפיקציה. */
export function buildSlotDaypartPromptBlock(slot: HabitCheckpointSlot): string {
  switch (slot) {
    case 'morning':
      return `אנרגיית ${SLOT_HE.morning}: ממוקד, קליל, מניע לפעולה — בלי חפירות. פתיחה שמרגישה "בוא נפתח את היום", לא בוחן.
דוגמת רוח (לא להעתיק): "בוקר טוב! הבקבוק כבר על השולחן? בוא נסגור את הפינה הזו על הבוקר."`;
    case 'midday':
      return `אנרגיית ${SLOT_HE.midday}: בדיקת מצב, אמפתיה לעומס — "איך הולך?", לא "למה לא עשית".
דוגמת רוח: "היי, אמצע היום. איך הולך עם המים? אם יש לחץ — שלוק אחד עכשיו וממשיכים."`;
    case 'evening':
      return `אנרגיית ${SLOT_HE.evening}: סיכום רך, עיבוד קשיים, סגירה חיובית — לא אשמה.
דוגמת רוח: "ערב טוב. איך עבר היום? אם היה קשה — תכתוב למה ונבין יחד למחר."`;
    default:
      return '';
  }
}

function jerusalemTodayStartIso(now = new Date()): string {
  const ymd = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
  return `${ymd}T00:00:00+02:00`;
}

function slotFromMetadata(meta: Record<string, unknown> | null): HabitCheckpointSlot | null {
  const raw = meta?.slot;
  if (raw === 'morning' || raw === 'midday' || raw === 'evening') return raw;
  const idx = meta?.check_in_index;
  if (typeof idx === 'number') {
    if (idx === 0) return 'morning';
    if (idx === 1) return 'midday';
    return 'evening';
  }
  return null;
}

function isAlmogNotifyRow(meta: Record<string, unknown> | null, source: string): boolean {
  if (meta?.mentor === 'almog') return true;
  if (ALMOG_NOTIFY_SOURCES.has(source)) return true;
  return source.startsWith('almog');
}

/**
 * מגעי אלמוג מהיום (ישראל) + האם המשתמש ענה בצ'אט אחרי כל מגע.
 */
export async function fetchTodayAlmogTouches(
  admin: SupabaseClient,
  userId: string,
  now = new Date()
): Promise<TodayAlmogTouch[]> {
  const dayStartIso = jerusalemTodayStartIso(now);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: notifRows } = await (admin as any)
    .from('notifications')
    .select('body, metadata, created_at')
    .eq('user_id', userId)
    .eq('type', 'ai_message')
    .gte('created_at', dayStartIso)
    .order('created_at', { ascending: true })
    .limit(20);

  if (!Array.isArray(notifRows) || notifRows.length === 0) return [];

  const touches: Omit<TodayAlmogTouch, 'userRepliedSince'>[] = [];
  for (const row of notifRows) {
    const meta = (row.metadata ?? null) as Record<string, unknown> | null;
    const source = typeof meta?.source === 'string' ? meta.source : '';
    if (!isAlmogNotifyRow(meta, source)) continue;
    const body = typeof row.body === 'string' ? row.body.trim() : '';
    if (!body) continue;
    const slot = slotFromMetadata(meta);
    touches.push({
      slot,
      slotLabel: slot ? SLOT_HE[slot] : 'מגע',
      bodySnippet: body.length > 140 ? `${body.slice(0, 140)}…` : body,
      sentAt: String(row.created_at),
    });
  }

  if (touches.length === 0) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: userMsgs } = await (admin as any)
    .from('ai_interactions')
    .select('created_at')
    .eq('user_id', userId)
    .eq('role', 'user')
    .gte('created_at', dayStartIso)
    .order('created_at', { ascending: true })
    .limit(50);

  const replyTimes = (userMsgs ?? [])
    .map((r: { created_at?: string }) => r.created_at)
    .filter((t): t is string => typeof t === 'string');

  return touches.map((t) => {
    const sentMs = new Date(t.sentAt).getTime();
    const userRepliedSince = replyTimes.some((rt) => new Date(rt).getTime() > sentMs);
    return { ...t, userRepliedSince };
  });
}

/**
 * בלוק פרומפט לחוק דילוג — מגעים קודמים היום בלי תשובה.
 */
export function formatTodayTouchesCooldownBlock(
  touches: TodayAlmogTouch[],
  currentSlot: HabitCheckpointSlot
): string | null {
  if (touches.length === 0) return null;

  const prior = touches.filter((t) => t.slot !== currentSlot || !t.slot);
  const unanswered = prior.filter((t) => !t.userRepliedSince);

  const lines: string[] = ['מגעים של אלמוג היום (לפני ההודעה הנוכחית):'];
  for (const t of prior) {
    const reply = t.userRepliedSince ? 'המשתמש/ת ענה/תה אחרי' : 'אין תשובה בצ\'אט אחרי';
    lines.push(
      `- ${t.slotLabel}: "${t.bodySnippet}" (${reply})`
    );
  }

  if (unanswered.length > 0) {
    lines.push(
      '',
      'חוק דילוג (חובה):',
      '- אל תחזור על אותה שאלה/מטאפורה/פתיחה מהמגעים שלמעלה.',
      '- אם מגע קודם בלי תשובה — הכר בעומס ("שלחתי בבוקר, מאמין שבטירוף") במקום "ראיתי שלא עשית".',
      '- גישה: "באתי לבדוק מה קורה איתך" — לא "באתי לבדוק שיעורי בית".',
      '- סיים בשאלה פתוחה על תחושה/קושי — לא כן/לא.'
    );
  } else if (prior.length > 0) {
    lines.push('', 'המשתמש/ת כבר דיבר/ה איתך היום — אפשר להמשיך את השיחה, לא להתחיל מחדש כמו רובוט.');
  }

  return lines.join('\n');
}
