import type { SupabaseClient } from '@supabase/supabase-js';
import { describeNotificationSource } from '../notifications/notification-chat-context';
import { extractSource } from '../notifications/replyable';

const LOOKBACK_DAYS = 14;
const MAX_NOTIFICATIONS = 22;
const BODY_CLIP = 220;

const ALMOG_NOTIFY_SOURCES = new Set([
  'almog_habit_checkpoint',
  'almog_personalized_check_in',
  'onboarding_check_in',
  'almog_followup_workflow',
  'almog_journey_companion',
  'almog_life_context',
  'cron_ops',
  'almog_kickoff',
  'almog_scheduled_reminder',
  'almog_passive_presence',
  'almog_sos',
  'almog_intro_welcome',
  'journey_motivation',
  'journey_followup',
  'lesson_feedback',
  'reengagement',
  'crisis_reconnect',
  'micro_win',
  'weight_log',
  'return_visit',
  'habit_checkpoint',
  'habit_checkpoint_batch',
]);

export type AlmogNotificationRecord = {
  id: string;
  title: string;
  body: string;
  source: string | null;
  sourceLabel: string | null;
  sentAt: string;
  sentAtLabel: string;
  isRead: boolean;
  isSent: boolean;
  userRepliedAfter: boolean;
};

function isAlmogNotification(meta: Record<string, unknown> | null, source: string): boolean {
  if (meta?.mentor === 'almog') return true;
  if (ALMOG_NOTIFY_SOURCES.has(source)) return true;
  return source.startsWith('almog');
}

function formatIsraelDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('he-IL', {
      timeZone: 'Asia/Jerusalem',
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function effectiveSentAt(row: {
  created_at?: string;
  send_at?: string | null;
  is_sent?: boolean | null;
}): string {
  if (row.is_sent && row.send_at) return row.send_at;
  if (row.send_at && new Date(row.send_at).getTime() <= Date.now()) return row.send_at;
  return row.created_at ?? new Date().toISOString();
}

/**
 * רשימת התראות שאלמוג שלח — 14 ימים אחרונים, עם תאריך/שעה מדויקים וסטטוס תגובה.
 */
export async function fetchRecentAlmogNotifications(
  supabase: SupabaseClient,
  userId: string,
  opts: { lookbackDays?: number; limit?: number } = {}
): Promise<AlmogNotificationRecord[]> {
  const lookbackDays = opts.lookbackDays ?? LOOKBACK_DAYS;
  const limit = opts.limit ?? MAX_NOTIFICATIONS;
  const since = new Date(Date.now() - lookbackDays * 86400000).toISOString();

  const { data: rows, error } = await supabase
    .from('notifications')
    .select('id, title, body, metadata, created_at, send_at, is_sent, is_read')
    .eq('user_id', userId)
    .eq('type', 'ai_message')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(limit * 2);

  if (error || !rows?.length) return [];

  const filtered: Array<{
    id: string;
    title: string;
    body: string;
    source: string | null;
    sentAt: string;
    isRead: boolean;
    isSent: boolean;
  }> = [];

  for (const row of rows) {
    const meta = (row.metadata ?? null) as Record<string, unknown> | null;
    const source = extractSource(meta);
    if (!isAlmogNotification(meta, source ?? '')) continue;
    const body = typeof row.body === 'string' ? row.body.trim() : '';
    if (!body) continue;
    filtered.push({
      id: row.id as string,
      title: typeof row.title === 'string' ? row.title.trim() : '',
      body,
      source,
      sentAt: effectiveSentAt(row as { created_at?: string; send_at?: string | null; is_sent?: boolean | null }),
      isRead: Boolean(row.is_read),
      isSent: Boolean(row.is_sent),
    });
    if (filtered.length >= limit) break;
  }

  if (!filtered.length) return [];

  const oldestSent = filtered.reduce(
    (min, r) => Math.min(min, new Date(r.sentAt).getTime()),
    Date.now()
  );

  const { data: userMsgs } = await supabase
    .from('ai_interactions')
    .select('created_at')
    .eq('user_id', userId)
    .eq('role', 'user')
    .gte('created_at', new Date(oldestSent - 60000).toISOString())
    .order('created_at', { ascending: true })
    .limit(200);

  const replyTimes = (userMsgs ?? [])
    .map((m) => new Date(m.created_at as string).getTime())
    .filter(Number.isFinite);

  return filtered.map((r) => {
    const sentMs = new Date(r.sentAt).getTime();
    return {
      ...r,
      sourceLabel: describeNotificationSource(r.source),
      sentAtLabel: formatIsraelDateTime(r.sentAt),
      userRepliedAfter: replyTimes.some((t) => t > sentMs + 5000),
    };
  });
}

export function formatAlmogNotificationsPromptBlock(
  records: AlmogNotificationRecord[],
  opts: { highlightNotificationId?: string | null } = {}
): string | null {
  if (!records.length) return null;

  const lines = records.map((r) => {
    const kind = r.sourceLabel ?? r.source ?? 'הודעה';
    const bodyShort =
      r.body.length > BODY_CLIP ? `${r.body.slice(0, BODY_CLIP)}…` : r.body;
    const titlePart = r.title && !bodyShort.startsWith(r.title.slice(0, 20)) ? ` "${r.title.slice(0, 60)}" ·` : '';
    const read = r.isRead ? 'נקרא' : 'לא נקרא';
    const reply = r.userRepliedAfter ? 'המשתמש ענה בצ׳אט אחר כך' : 'ללא תשובה בצ׳אט';
    const sent = r.isSent ? 'נשלח' : 'נוצר באפליקציה';
    const highlight =
      opts.highlightNotificationId && r.id === opts.highlightNotificationId ? ' ← מגיבים עכשיו' : '';
    return `• ${r.sentAtLabel} · ${kind}${titlePart} "${bodyShort}"\n  (${sent} · ${read} · ${reply})${highlight}`;
  });

  return `[התראות שאלמוג שלח — מקור אמת עם תאריך ושעה (ישראל). אל תטען שלא שלחת משהו שמופיע כאן. אל תמציא התראות שלא ברשימה.]

${lines.join('\n')}

כללים: אם המשתמש מתייחס ל"מה ששלחת"/"קיבלתי הודעה"/"התראה" — התאם לשורה המדויקת לפי זמן ותוכן. [מענה להתראה] ספציפית קודם ברשימה — עדיפות עליונה.`;
}
